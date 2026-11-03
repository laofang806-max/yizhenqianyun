"""Sequential frozen-text encoding then sharded GPU denoising + CPU VAE decoding (8GB test configuration)."""
from pathlib import Path
import argparse,os,subprocess,sys,uuid
p=argparse.ArgumentParser();p.add_argument('--prompt',required=True);p.add_argument('--seed',type=int,default=42);p.add_argument('--steps',type=int,default=25);p.add_argument('--variant',choices=['base','pilot','raw','ema'],default='ema');p.add_argument('--base',type=Path);p.add_argument('--output',type=Path)
a=p.parse_args();root=Path(__file__).resolve().parents[2]
env=os.environ.copy()
if a.base:env['SDXL_BASE']=str(a.base.resolve())
output=(a.output or root/'data/ml/inference'/uuid.uuid4().hex[:8]).resolve()
output.mkdir(parents=True,exist_ok=True)
env.update(ML_RUN_DIR=str(output),SDXL_PROMPT=a.prompt)
scripts=Path(__file__).resolve().parent
for script,extra in [('shard_unet.py',[]),('cache_benchmark_prompt.py',[]),('benchmark_one.py',['--variant',a.variant,'--seed',str(a.seed),'--steps',str(a.steps)])]:
 subprocess.run([sys.executable,str(scripts/script),*extra],env=env,check=True)
print('Generated image and real timings:',output/'benchmark-final'/f'{a.variant}_seed{a.seed}.png')
