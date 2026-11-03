import os
os.environ.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'})
from pathlib import Path
import gc,json,time
import torch
from transformers import CLIPTokenizer,CLIPTextModel,CLIPTextModelWithProjection
PACKAGE = Path(__file__).resolve().parents[2]
BASE = Path(os.environ.get('SDXL_BASE', str(PACKAGE/'src/ml/models/sdxl-base-1.0')))
ROOT = Path(os.environ.get('ML_RUN_DIR', str(PACKAGE/'data/ml/runs/v2')))
ROOT.mkdir(parents=True, exist_ok=True)


path=ROOT/'benchmark-prompt-cache.pt'
if path.exists():raise SystemExit(0)
positive='A clean black line drawing of a small bird perched on a flowering branch, simple flat embroidery design, complete centered composition, pure white background, no text, no fabric texture'
negative='photograph, cloth texture, watermark, letters, cropped subject'
positive=os.environ.get('SDXL_PROMPT',positive)
hidden=[];compute=0
for sub,cls in [('text_encoder',CLIPTextModel),('text_encoder_2',CLIPTextModelWithProjection)]:
    tokenizer=CLIPTokenizer.from_pretrained(BASE,subfolder='tokenizer' if sub=='text_encoder' else 'tokenizer_2',local_files_only=True)
    encoder=cls.from_pretrained(BASE,subfolder=sub,variant='fp16',torch_dtype=torch.bfloat16,local_files_only=True).to('cuda').eval()
    ids=tokenizer([positive,negative],padding='max_length',max_length=tokenizer.model_max_length,truncation=True,return_tensors='pt').input_ids.to('cuda')
    torch.cuda.synchronize();start=time.perf_counter()
    with torch.no_grad():output=encoder(ids,output_hidden_states=True)
    torch.cuda.synchronize();compute+=time.perf_counter()-start
    hidden.append(output.hidden_states[-2].detach().cpu())
    if sub=='text_encoder_2':pooled=output.text_embeds.detach().cpu()
    del output,encoder,tokenizer,ids;gc.collect();torch.cuda.empty_cache()
torch.save({'embeds':torch.cat(hidden,dim=-1),'pooled':pooled,'positive':positive,'negative':negative},path)
(ROOT/'benchmark-text-cache.json').write_text(json.dumps({'prompt':positive,'negative':negative,'frozenTextEncoders':True,'computeSecondsOnce':compute,
    'benchmarkCondition':'same fixed text embeddings reused for all variants; measured image generation excludes text encoding'},indent=2),encoding='utf-8')
print('Frozen text embeddings cached for all variants',flush=True)
