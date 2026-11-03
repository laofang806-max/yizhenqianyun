"""Download the pinned base files with resume provided by huggingface_hub; then verify full hashes."""
from pathlib import Path
import argparse,hashlib,json,os
from huggingface_hub import hf_hub_download
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path);p.add_argument('--verify-only',action='store_true');args=p.parse_args()
root=Path(__file__).resolve().parent
manifest=json.loads((root/'base-model-manifest.json').read_text(encoding='utf-8'))
dest=args.directory or Path(os.environ.get('SDXL_BASE',str(root/'models/sdxl-base-1.0')))
for entry in manifest['files']:
 file=dest/entry['path']
 if not args.verify_only and not file.exists():
  hf_hub_download(repo_id=manifest['repo'],filename=entry['path'],revision=manifest['revision'],local_dir=dest)
 if not file.exists() or file.stat().st_size!=entry['bytes']:raise SystemExit(f'Missing or wrong size: {file}')
 with file.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
 if digest!=entry['sha256']:raise SystemExit(f'Hash mismatch: {file}; move this corrupt file aside and rerun.')
 print('VERIFIED',entry['path'],flush=True)
print('PASS: all pinned SDXL base files verified')
