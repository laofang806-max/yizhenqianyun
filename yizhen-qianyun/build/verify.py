from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'build/source-manifest.json').read_text(encoding='utf-8'))
errors=[]
for entry in manifest['files']:
 path=root/entry['path']
 if not path.is_file():errors.append('MISSING '+entry['path']);continue
 with path.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
 if digest!=entry['sha256']:errors.append('CHANGED '+entry['path'])
if errors:print('\n'.join(errors));sys.exit(1)
print('PASS:',len(manifest['files']),'packaged files match SHA256 manifest')
