"""Convert signed encoder counts only. No serial or motion access."""
import argparse,json,math
def signed32(word):
 value=int(word,16)
 if value<0 or value>0xffffffff:raise ValueError('Expected a 32-bit hexadecimal count')
 return value-0x100000000 if value&0x80000000 else value
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--x-hex',required=True);p.add_argument('--y-hex',required=True);p.add_argument('--baseline-x',default='00000000');p.add_argument('--baseline-y',default='00000000');p.add_argument('--ppr',type=float,default=1000);p.add_argument('--lead-mm',type=float,default=8);p.add_argument('--quadrature',type=int,default=4)
 a=p.parse_args()
 try:
  if not all(math.isfinite(v) and v>0 for v in [a.ppr,a.lead_mm,a.quadrature]):raise ValueError('Positive finite parameters required')
  ratio=a.ppr*a.quadrature/a.lead_mm
  print(json.dumps({'countsPerMm':ratio,'deltaXmm':(signed32(a.x_hex)-signed32(a.baseline_x))/ratio,'deltaYmm':(signed32(a.y_hex)-signed32(a.baseline_y))/ratio,'meaning':'shaft-encoder displacement; not independently measured cloth travel','hardwareAccess':False}))
 except ValueError as e:p.exit(1,str(e)+'\n')
