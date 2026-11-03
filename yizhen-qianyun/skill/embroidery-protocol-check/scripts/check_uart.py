"""Offline single-colour UART validation. Never opens a device."""
import argparse,json,math,re
from pathlib import Path
def check(path,steps,standard=None):
 text=Path(path).read_bytes().decode('ascii')
 if not text.endswith('\n'):raise ValueError('Missing final LF; FPGA will not parse the last action')
 lines=text.splitlines()
 if not lines:raise ValueError('Empty data')
 header=re.fullmatch(r'COLOR (black|red|yellow|blue|layer) ([0-9]+)',lines[0])
 if not header:raise ValueError('Expected one COLOR header')
 colour,n=header[1],int(header[2]);actions=lines[1:]
 if n<1 or n>4096 or n!=len(actions):raise ValueError('Action count mismatch or FPGA RAM overflow')
 targets=[];x=y=0
 for index,line in enumerate(actions,2):
  match=re.fullmatch(r'([JS]),([+-]?\d+),([+-]?\d+)',line)
  if not match:raise ValueError(f'Invalid action at line {index}')
  dx,dy=int(match[2]),int(match[3])
  if not(-32768<=dx<=32767 and -32768<=dy<=32767):raise ValueError(f'int16 overflow at line {index}')
  x+=dx;y+=dy
  if match[1]=='S':targets.append((x,y))
 if standard:
  data=json.loads(Path(standard).read_text(encoding='utf-8-sig'))
  rnd=lambda value:math.floor(value+.5)
  ox=rnd(data['frame']['width']/2*steps);oy=rnd(data['frame']['height']/2*steps)
  expected=[]
  if colour=='layer' and not data.get('metadata',{}).get('thread'):
   raise ValueError('layer comparison requires metadata.thread for actual thread colour')
  carrier='black' if colour=='layer' else colour
  for segment in data['paths'][carrier]['segments']:
   for point in segment['points']:
    if point['action']=='stitch':expected.append((rnd(point['x']*steps)-ox,rnd(point['y']*steps)-oy))
  if targets!=expected:raise ValueError('S target sequence differs from standardized JSON')
 xs=[q[0]/steps for q in targets];ys=[q[1]/steps for q in targets]
 return {'colour':colour,'actions':n,'stitches':len(targets),'bytes':len(text.encode('ascii')),'widthMm':max(xs)-min(xs) if xs else 0,'heightMm':max(ys)-min(ys) if ys else 0,'repeatedStitchTargets':len(targets)-len(set(targets)),'jsonTargetsCompared':bool(standard),'hardwareAccess':False}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('file');parser.add_argument('--steps-per-mm',type=float,default=1600);parser.add_argument('--standard-json')
 args=parser.parse_args()
 try:
  if not math.isfinite(args.steps_per_mm) or args.steps_per_mm<=0:raise ValueError('Invalid STEP/mm')
  print(json.dumps(check(args.file,args.steps_per_mm,args.standard_json),ensure_ascii=False))
 except (ValueError,KeyError,TypeError,OSError) as error:parser.exit(1,str(error)+'\n')
