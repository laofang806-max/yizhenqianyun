import os
"""Repackage verified FP16 UNet tensors into bounded shards; no parameter changes."""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
import torch
from safetensors import safe_open
from safetensors.torch import save_file

PACKAGE = Path(__file__).resolve().parents[2]
BASE = Path(os.environ.get('SDXL_BASE', str(PACKAGE/'src/ml/models/sdxl-base-1.0')))
ROOT = Path(os.environ.get('ML_RUN_DIR', str(PACKAGE/'data/ml/runs/v2')))
ROOT.mkdir(parents=True, exist_ok=True)

root=BASE.parent
source=root/'sdxl-base-1.0/unet/diffusion_pytorch_model.fp16.safetensors'
dest=root/'sdxl-unet-fp16-sharded'
index=dest/'diffusion_pytorch_model.safetensors.index.json'
if index.exists():
    print('Existing shard index found',flush=True)
    raise SystemExit(0)
dest.mkdir(parents=True,exist_ok=True)
with source.open('rb') as stream:
    digest=hashlib.file_digest(stream,'sha256').hexdigest()
assert digest=='83e012a805b84c7ca28e5646747c90a243c65c8ba4f070e2d7ddc9d74661e139'
shutil.copy2(source.parent/'config.json',dest/'config.json')
parts=[];current={};used=0;total=0
with safe_open(source,framework='np') as handle:
    for name in handle.keys():
        tensor=torch.from_numpy(np.array(handle.get_tensor(name),copy=True))
        size=tensor.numel()*tensor.element_size()
        if current and used+size>512*1024**2:
            number=len(parts)+1;file=f'diffusion_pytorch_model-{number:05}.safetensors'
            save_file(current,str(dest/file),metadata={'format':'pt'})
            parts.append((file,list(current)));current={};used=0
            print(f'Saved shard {number}',flush=True)
        current[name]=tensor;used+=size;total+=size
if current:
    file=f'diffusion_pytorch_model-{len(parts)+1:05}.safetensors'
    save_file(current,str(dest/file),metadata={'format':'pt'});parts.append((file,list(current)))
weight_map={key:file for file,keys in parts for key in keys}
index.write_text(json.dumps({'metadata':{'total_size':total},'weight_map':weight_map},indent=2),encoding='utf-8')
(dest/'source.json').write_text(json.dumps({'source':str(source),'sourceSha256':digest,'tensors':len(weight_map),'parameterValuesModified':False,'reason':'bounded files avoid observed Windows large-file mmap access violation'},indent=2),encoding='utf-8')
print(f'UNet repackaged into {len(parts)} shards',flush=True)
