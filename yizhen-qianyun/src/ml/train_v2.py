"""Small-data SDXL experiment: caption caches, asymmetric attention LoRA, Min-SNR and adapter EMA."""
import os
os.environ.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','TOKENIZERS_PARALLELISM':'false'})
from pathlib import Path
import csv,gc,hashlib,json,random,time
import numpy as np
from PIL import Image,ImageOps
import torch
import torch.nn.functional as F
from diffusers import AutoencoderKL,DDPMScheduler,UNet2DConditionModel,StableDiffusionXLPipeline
from diffusers.utils import convert_state_dict_to_diffusers
from transformers import CLIPTokenizer,CLIPTextModel,CLIPTextModelWithProjection
from peft import LoraConfig
from peft.utils import get_peft_model_state_dict
import bitsandbytes as bnb

PACKAGE = Path(__file__).resolve().parents[2]
BASE = Path(os.environ.get('SDXL_BASE', str(PACKAGE/'src/ml/models/sdxl-base-1.0')))
ROOT = Path(os.environ.get('ML_RUN_DIR', str(PACKAGE/'data/ml/runs/v2')))
ROOT.mkdir(parents=True, exist_ok=True)


ASSETS=PACKAGE/'src/upper/src/assets'
SEED=42
STEPS=100
ACCUM=4
LR=5e-5
DECAY=.95
GAMMA=5.0
DTYPE=torch.bfloat16

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

def status(stage,**extra):
    write_json(ROOT/'status.json',{'stage':stage,'targetSteps':STEPS,'trainingStarted':stage not in ['preparing_data','caching'],'smallSampleExperiment':True,**extra})

def clean():
    gc.collect()
    torch.cuda.empty_cache()

def prepare():
    status('preparing_data')
    records=[]
    descriptions=[
        ('bird-original.jpg','train','a small bird perched on a flowering branch with leaves, clean black line drawing on a white background, isolated embroidery motif'),
        ('solo-bird.png','train','one small bird in side view, clean black outline drawing, isolated on a white background'),
        ('flower-original.png','diagnostic','one five-petal flower with a round center, clean black outline drawing, isolated on a white background')]
    for source,split,caption in descriptions:
        path=ASSETS/source
        with Image.open(path) as image:
            rgba=ImageOps.exif_transpose(image).convert('RGBA')
            white=Image.new('RGBA',rgba.size,'white');white.alpha_composite(rgba)
            rgb=white.convert('RGB')
        variants=[(1.0,0,False),(.88,-5,False),(.88,5,False),(.94,0,True)] if split=='train' else [(1.0,0,False)]
        for number,(scale,angle,flip) in enumerate(variants):
            prepared=ImageOps.pad(rgb,(512,512),color='white',method=Image.Resampling.LANCZOS)
            if scale<1:
                side=round(512*scale);small=prepared.resize((side,side),Image.Resampling.LANCZOS)
                prepared=Image.new('RGB',(512,512),'white');prepared.paste(small,((512-side)//2,(512-side)//2))
            if flip:prepared=ImageOps.mirror(prepared)
            if angle:prepared=prepared.rotate(angle,Image.Resampling.BICUBIC,fillcolor='white')
            output=ROOT/'images'/f'{path.stem}-{number}.png';output.parent.mkdir(exist_ok=True)
            prepared.save(output)
            records.append({'file':str(output),'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                'split':split,'caption':caption,'scale':scale,'angle':angle,'flip':flip,
                'sourceGroup':'flower-independent' if split=='diagnostic' else 'bird-and-derived-crop'})
    write_json(ROOT/'dataset.json',{'records':records,'trainVariants':8,'trainSourceFiles':2,'trainIndependentCompositions':1,
        'diagnosticSourceFiles':1,'augmentationIsNotIndependentData':True,'diagnosticIsNotRepresentativeValidation':True})
    return records

def cache(records):
    path=ROOT/'cached-tensors.pt'
    if path.exists():return torch.load(path,map_location='cpu',weights_only=True)
    status('caching')
    captions=list(dict.fromkeys(r['caption'] for r in records))
    texts={caption:[] for caption in captions};pooled={}
    for sub,cls in [('text_encoder',CLIPTextModel),('text_encoder_2',CLIPTextModelWithProjection)]:
        tokenizer=CLIPTokenizer.from_pretrained(BASE,subfolder='tokenizer' if sub=='text_encoder' else 'tokenizer_2',local_files_only=True)
        encoder=cls.from_pretrained(BASE,subfolder=sub,variant='fp16',torch_dtype=DTYPE,local_files_only=True).to('cuda').eval()
        with torch.no_grad():
            for caption in captions:
                ids=tokenizer(caption,padding='max_length',max_length=tokenizer.model_max_length,truncation=True,return_tensors='pt').input_ids.to('cuda')
                output=encoder(ids,output_hidden_states=True)
                texts[caption].append(output.hidden_states[-2].detach().cpu())
                if sub=='text_encoder_2':pooled[caption]=output.text_embeds.detach().cpu()
                del output,ids
        del encoder,tokenizer;clean()
    vae=AutoencoderKL.from_pretrained(BASE,subfolder='vae',variant='fp16',torch_dtype=torch.float32,local_files_only=True).to('cuda').eval()
    cached=[]
    with torch.no_grad():
        for record in records:
            image=np.asarray(Image.open(record['file']).convert('RGB'),dtype=np.float32)/127.5-1
            pixels=torch.from_numpy(image).permute(2,0,1).unsqueeze(0).to('cuda')
            latent=vae.encode(pixels).latent_dist.mean*vae.config.scaling_factor
            assert torch.isfinite(latent).all()
            cached.append({'latent':latent.cpu(),'embeds':torch.cat(texts[record['caption']],dim=-1),
                'pooled':pooled[record['caption']],'timeIds':torch.tensor([[512,512,0,0,512,512]],dtype=torch.float32),
                'split':record['split'],'file':record['file']})
            del latent,pixels
    del vae;clean()
    torch.save(cached,path)
    return cached

def save_adapter(model,folder):
    state={k:v.detach().float().cpu().clone() for k,v in get_peft_model_state_dict(model).items()}
    StableDiffusionXLPipeline.save_lora_weights(save_directory=folder,unet_lora_layers=convert_state_dict_to_diffusers(state),
        unet_lora_adapter_metadata=model.peft_config['default'].to_dict())

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    if (ROOT/'ema/pytorch_lora_weights.safetensors').exists():raise RuntimeError('Completed v2 exists; refusing overwrite')
    random.seed(SEED);np.random.seed(SEED);torch.manual_seed(SEED)
    records=prepare();cached=cache(records)
    train=[r for r in cached if r['split']=='train'];diagnostic=[r for r in cached if r['split']=='diagnostic']
    scheduler=DDPMScheduler.from_pretrained(BASE,subfolder='scheduler',local_files_only=True)
    assert scheduler.config.prediction_type=='epsilon','This experiment implements epsilon objective explicitly'
    model=UNet2DConditionModel.from_pretrained(BASE.parent/'sdxl-unet-fp16-sharded',torch_dtype=DTYPE,low_cpu_mem_usage=True,local_files_only=True)
    model.requires_grad_(False)
    model.add_adapter(LoraConfig(r=4,lora_alpha=4,lora_dropout=.05,target_modules=['to_q','to_k','to_v','to_out.0'],
        rank_pattern={r'.*attn2.*':8},alpha_pattern={r'.*attn2.*':8},init_lora_weights='gaussian'))
    ranks={'self':[],'cross':[]}
    for name,module in model.named_modules():
        if hasattr(module,'r') and 'default' in module.r:
            ranks['cross' if '.attn2.' in name else 'self'].append(module.r['default'])
    assert set(ranks['self'])=={4} and set(ranks['cross'])=={8},ranks
    parameters=[p for p in model.parameters() if p.requires_grad]
    for p in parameters:p.data=p.data.float()
    config={'steps':STEPS,'resolution':512,'batchSize':1,'gradientAccumulation':ACCUM,'learningRate':LR,
        'rankSelf':4,'rankCross':8,'dropout':.05,'emaDecay':DECAY,'snrGamma':GAMMA,'seed':SEED,
        'trainableParameters':sum(p.numel() for p in parameters),'totalParameters':sum(p.numel() for p in model.parameters()),
        'attentionAdapterCounts':{k:len(v) for k,v in ranks.items()},'captionEncodersFrozen':True,'vaeFrozen':True,
        'latentCache':'fixed posterior means; no stochastic latent resampling','independentTrainCompositions':1,
        'diagnosticImages':1,'validationTimesteps':[250,500,750],'validationNoiseSeed':1234,
        'validationScope':'fixed-noise diagnostic on one unseen flower, not representative generalization'}
    write_json(ROOT/'config.json',config)
    model.to('cuda');model.enable_gradient_checkpointing()
    parameters=[p for p in model.parameters() if p.requires_grad]
    optimizer=bnb.optim.AdamW8bit(parameters,lr=LR,weight_decay=.01)
    ema=[p.detach().clone() for p in parameters]
    def predict(record,noise,t):
        latent=record['latent'].to('cuda',dtype=DTYPE)
        noisy=scheduler.add_noise(latent,noise,t)
        with torch.autocast('cuda',dtype=DTYPE):
            return model(noisy,t,encoder_hidden_states=record['embeds'].to('cuda',dtype=DTYPE),
                added_cond_kwargs={'text_embeds':record['pooled'].to('cuda',dtype=DTYPE),'time_ids':record['timeIds'].to('cuda',dtype=DTYPE)}).sample
    def diagnostic_loss(use_ema=False):
        previous=[p.detach().clone() for p in parameters] if use_ema else None
        if use_ema:
            with torch.no_grad():
                for p,value in zip(parameters,ema):p.copy_(value)
        model.eval();values=[]
        with torch.no_grad():
            for record in diagnostic:
                for timestep in [250,500,750]:
                    noise=torch.randn(record['latent'].shape,generator=torch.Generator().manual_seed(1234+timestep)).to('cuda',dtype=DTYPE)
                    pred=predict(record,noise,torch.tensor([timestep],device='cuda',dtype=torch.long))
                    values.append(F.mse_loss(pred.float(),noise.float()).item())
        if previous:
            with torch.no_grad():
                for p,value in zip(parameters,previous):p.copy_(value)
        model.train()
        return sum(values)/len(values)
    fields=['step','rawMse','weightedLoss','learningRate','optimizerSeconds','elapsedSeconds','peakAllocatedMiB','peakReservedMiB','diagnosticRawMse','diagnosticEmaMse']
    started=time.perf_counter()
    base_diagnostic=diagnostic_loss()
    with (ROOT/'metrics.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader()
        writer.writerow({'step':0,'diagnosticRawMse':base_diagnostic,'diagnosticEmaMse':base_diagnostic});stream.flush()
        for step in range(1,STEPS+1):
            model.train();optimizer.zero_grad(set_to_none=True);torch.cuda.reset_peak_memory_stats();torch.cuda.synchronize()
            tick=time.perf_counter();raw_values=[];weighted_values=[]
            for micro in range(ACCUM):
                record=random.choice(train)
                noise=torch.randn(record['latent'].shape,device='cuda',dtype=DTYPE)
                t=torch.randint(0,scheduler.config.num_train_timesteps,(1,),device='cuda',dtype=torch.long)
                pred=predict(record,noise,t)
                mse=F.mse_loss(pred.float(),noise.float(),reduction='none').mean(dim=(1,2,3))
                alpha=scheduler.alphas_cumprod.to('cuda')[t].float();snr=alpha/(1-alpha)
                weights=torch.minimum(snr,torch.full_like(snr,GAMMA))/snr
                weighted=(mse*weights).mean()
                assert torch.isfinite(weighted),'Nonfinite loss'
                (weighted/ACCUM).backward();raw_values.append(mse.detach().mean().item());weighted_values.append(weighted.detach().item())
            assert any(p.grad is not None and torch.count_nonzero(p.grad).item()>0 for p in parameters),'No adapter gradients'
            torch.nn.utils.clip_grad_norm_(parameters,1.0);optimizer.step()
            with torch.no_grad():
                for shadow,p in zip(ema,parameters):shadow.lerp_(p.detach(),1-DECAY)
            torch.cuda.synchronize();duration=time.perf_counter()-tick
            row={'step':step,'rawMse':sum(raw_values)/ACCUM,'weightedLoss':sum(weighted_values)/ACCUM,'learningRate':LR,
                'optimizerSeconds':duration,'elapsedSeconds':time.perf_counter()-started,
                'peakAllocatedMiB':torch.cuda.max_memory_allocated()/1024**2,'peakReservedMiB':torch.cuda.max_memory_reserved()/1024**2}
            if step%25==0:
                row.update(diagnosticRawMse=diagnostic_loss(),diagnosticEmaMse=diagnostic_loss(True))
                save_adapter(model,ROOT/f'checkpoint-{step}')
            writer.writerow(row);stream.flush()
            status('training',step=step,rawMse=row['rawMse'],weightedLoss=row['weightedLoss'],peakAllocatedMiB=row['peakAllocatedMiB'])
            print(f"Step {step}/{STEPS} rawMSE={row['rawMse']:.6f} weighted={row['weightedLoss']:.6f} seconds={duration:.2f}",flush=True)
        save_adapter(model,ROOT/'raw')
        torch.save({'optimizer':optimizer.state_dict(),'step':STEPS,'ema':[v.cpu() for v in ema]},ROOT/'optimizer-local-trusted.pt')
        with torch.no_grad():
            for p,value in zip(parameters,ema):p.copy_(value)
        save_adapter(model,ROOT/'ema')
    weights=ROOT/'ema/pytorch_lora_weights.safetensors'
    status('trained',step=STEPS,weights=str(weights),sha256=hashlib.sha256(weights.read_bytes()).hexdigest(),qualityValidated=False)

if __name__=='__main__':
    try:main()
    except Exception as error:
        ROOT.mkdir(parents=True,exist_ok=True);status('failed',error=str(error));raise
