"""One isolated real SDXL inference, with actual timings and GPU allocator peaks."""
import os
os.environ.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','TOKENIZERS_PARALLELISM':'false'})
from pathlib import Path
import argparse,json,time,statistics
import numpy as np
import torch
from diffusers import UNet2DConditionModel,StableDiffusionXLPipeline,AutoencoderKL

class ManualDevicePipeline(StableDiffusionXLPipeline):
    @property
    def _execution_device(self):return torch.device('cuda')

parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['base','pilot','raw','ema'],required=True);parser.add_argument('--seed',type=int,required=True);parser.add_argument('--steps',type=int,default=25)
args=parser.parse_args()
torch.set_num_threads(4)

PACKAGE = Path(__file__).resolve().parents[2]
BASE = Path(os.environ.get('SDXL_BASE', str(PACKAGE/'src/ml/models/sdxl-base-1.0')))
ROOT = Path(os.environ.get('ML_RUN_DIR', str(PACKAGE/'data/ml/runs/v2')))
ROOT.mkdir(parents=True, exist_ok=True)
OUTPUT=ROOT/'benchmark-final';OUTPUT.mkdir(exist_ok=True)

weights={v:PACKAGE/'src/ml/adapters'/v for v in ['pilot','raw','ema']}
started=time.perf_counter()
unet=UNet2DConditionModel.from_pretrained(BASE.parent/'sdxl-unet-fp16-sharded',torch_dtype=torch.bfloat16,low_cpu_mem_usage=True,device_map={'':'cuda'},local_files_only=True)
vae=AutoencoderKL.from_pretrained(BASE,subfolder='vae',variant='fp16',torch_dtype=torch.float32,disable_mmap=True,local_files_only=True)
pipe=ManualDevicePipeline.from_pretrained(BASE,unet=unet,vae=vae,text_encoder=None,text_encoder_2=None,tokenizer=None,tokenizer_2=None,variant='fp16',torch_dtype=torch.bfloat16,local_files_only=True)
if args.variant!='base':pipe.load_lora_weights(str(weights[args.variant]),weight_name='pytorch_lora_weights.safetensors',local_files_only=True)
if args.variant in ['raw','ema']:
    cross=[(next(iter(module.r.values())),next(iter(module.scaling.values()))) for name,module in pipe.unet.named_modules() if '.attn2.' in name and hasattr(module,'r')]
    assert cross and all(rank==8 and abs(scale-1)<1e-6 for rank,scale in cross),'Asymmetric rank/alpha metadata not restored'
pipe.unet.eval()
assert not any(m.training for m in pipe.unet.modules() if isinstance(m,torch.nn.Dropout)),'Dropout active during inference'
pipe.unet.to('cuda');pipe.maybe_free_model_hooks=lambda:None
cached=torch.load(ROOT/'benchmark-prompt-cache.pt',map_location='cpu',weights_only=True)
load_seconds=time.perf_counter()-started
torch.cuda.synchronize();torch.cuda.reset_peak_memory_stats()
timestamps=[]
def callback(pipeline,step,timestep,kwargs):
    torch.cuda.synchronize();timestamps.append(time.perf_counter());return kwargs
settings={'prompt':cached['positive'],
    'negative_prompt':'photograph, cloth texture, watermark, letters, cropped subject','width':512,'height':512,'num_inference_steps':args.steps,'guidance_scale':5.0}
start=time.perf_counter()
call_settings={k:v for k,v in settings.items() if k not in ['prompt','negative_prompt']}
latents=pipe(**call_settings,prompt_embeds=cached['embeds'][0:1].to('cuda'),negative_prompt_embeds=cached['embeds'][1:2].to('cuda'),
    pooled_prompt_embeds=cached['pooled'][0:1].to('cuda'),negative_pooled_prompt_embeds=cached['pooled'][1:2].to('cuda'),
    generator=torch.Generator(device='cpu').manual_seed(args.seed),output_type='latent',callback_on_step_end=callback).images
torch.cuda.synchronize();denoise_seconds=time.perf_counter()-start
tick=time.perf_counter();pipe.vae.enable_tiling();pipe.vae.tile_sample_min_size=256;pipe.vae.tile_latent_min_size=32
with torch.no_grad():decoded=pipe.vae.decode(latents.detach().cpu().float()/pipe.vae.config.scaling_factor,return_dict=False)[0]
assert torch.isfinite(decoded).all()
image=pipe.image_processor.postprocess(decoded,output_type='pil')[0]
decode_seconds=time.perf_counter()-tick
image.save(OUTPUT/f'{args.variant}_seed{args.seed}.png')
rgb=np.asarray(image.convert('RGB'));margin=round(.08*rgb.shape[0]);band=np.zeros(rgb.shape[:2],dtype=bool)
band[:margin,:]=True;band[-margin:,:]=True;band[:,:margin]=True;band[:,-margin:]=True
nonwhite=(rgb.min(axis=2)<230);dark=(rgb.max(axis=2)<100)
intervals=[timestamps[i]-timestamps[i-1] for i in range(3,len(timestamps))]
record={'variant':args.variant,'seed':args.seed,'settings':settings,'loadSeconds':load_seconds,
    'encodeAndDenoiseSeconds':denoise_seconds,'decodeAndTransferSeconds':decode_seconds,'generationSeconds':denoise_seconds+decode_seconds,
    'steadyDenoiseStepSeconds':statistics.median(intervals) if intervals else None,'stepIntervalsSeconds':intervals,
    'peakAllocatedMiB':torch.cuda.max_memory_allocated()/1024**2,'peakReservedMiB':torch.cuda.max_memory_reserved()/1024**2,
    'borderNonwhiteRate':float(nonwhite[band].mean()),'borderDarkRate':float(dark[band].mean()),'borderWidthFraction':.08,
    'textEmbeddingsCached':True,'execution':'manual UNet GPU, VAE CPU, no automatic offload hooks',
    'explicitEvalMode':True,'allDropoutDisabled':True,
    'weightLoading':'sharded direct-to-GPU; loadSeconds not used to claim model speed superiority',
    'scope':'isolated process; generation includes cached tensor transfer and CPU tiled decoding, excludes frozen text encoding and disk loading; no FPGA inference'}
(OUTPUT/f'{args.variant}_seed{args.seed}.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(record,ensure_ascii=False),flush=True)

