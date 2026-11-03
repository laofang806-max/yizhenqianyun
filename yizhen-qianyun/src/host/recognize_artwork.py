"""Local reference registration. It reuses a reviewed route only after geometric verification.
Photo bytes enter on stdin and are never stored. No network, UART, or motion access.
"""
from pathlib import Path
import sys,json,base64,io,os
import numpy as np
from PIL import Image,ImageOps
from skimage.feature import ORB,match_descriptors
from skimage.measure import ransac
from skimage.transform import ProjectiveTransform
from scipy.spatial import ConvexHull

def gray(image):
 image=ImageOps.exif_transpose(image).convert('L')
 image.thumbnail((960,960))
 a=np.asarray(image,dtype=np.float64)/255
 lo,hi=np.percentile(a,[2,98])
 return np.clip((a-lo)/max(.15,hi-lo),0,1),image.size
def features(image):
 a,size=gray(image);orb=ORB(n_keypoints=1400,fast_threshold=.06)
 orb.detect_and_extract(a)
 return orb.keypoints[:,::-1],orb.descriptors,size
def coverage(points,w,h):
 try:return ConvexHull(points).volume/(w*h)
 except Exception:return 0.
def main():
 body=json.loads(sys.stdin.buffer.read(3_000_001))
 encoded=body.get('image','')
 if not isinstance(encoded,str) or len(encoded)>2_800_000:raise ValueError('Invalid image input')
 data=base64.b64decode(encoded,validate=True)
 with Image.open(io.BytesIO(data)) as image:
  if image.width*image.height>2_000_000:raise ValueError('Resize photograph before matching')
  try:q,qd,(qw,qh)=features(image)
  except RuntimeError:return {'matched':False,'reason':'no_features'}
 cache=Path(__file__).with_name('flower_bird_features.npz')
 with np.load(cache,allow_pickle=False) as ref:
  r=ref['points'];rd=ref['descriptors'];rw,rh=ref['size']
 pairs=match_descriptors(rd,qd,cross_check=True,max_ratio=.78)
 if len(pairs)<28:return {'matched':False,'reason':'insufficient_matches'}
 src=r[pairs[:,0]];dst=q[pairs[:,1]]
 model,inliers=ransac((src,dst),ProjectiveTransform,min_samples=4,residual_threshold=4,max_trials=900,rng=np.random.default_rng(2718))
 if model is None or inliers is None:return {'matched':False,'reason':'no_consistent_geometry'}
 count=int(inliers.sum());fraction=count/len(pairs)
 ref_coverage=coverage(src[inliers],rw,rh)
 errors=np.linalg.norm(model(src[inliers])-dst[inliers],axis=1)
 if count<24 or fraction<.42 or ref_coverage<.22 or float(np.median(errors))>2.3:
  return {'matched':False,'reason':'geometry_rejected'}
 h=np.diag([1/qw,1/qh,1.])@model.params@np.diag([rw,rh,1.])
 corners=np.array([[0,0],[1,0],[1,1],[0,1]],float)
 v=np.c_[corners,np.ones(4)]@h.T
 if np.any(v[:,2]<=0):return {'matched':False,'reason':'invalid_projection'}
 quad=v[:,:2]/v[:,2:]
 cross=np.cross(np.roll(quad,-1,axis=0)-quad,np.roll(quad,-2,axis=0)-np.roll(quad,-1,axis=0))
 area=.5*abs(np.dot(quad[:,0],np.roll(quad[:,1],1))-np.dot(quad[:,1],np.roll(quad[:,0],1)))
 if not np.all(cross>0) or area<.06 or area>1.5 or np.any(quad < -.12) or np.any(quad>1.12):
  return {'matched':False,'reason':'invalid_artwork_extent'}
 return {'matched':True,'artwork':'full','homography':h.reshape(-1).tolist(),'inliers':count,'medianErrorPx':round(float(np.median(errors)),3)}
if __name__=='__main__':
 try:
  if '--prepare' in sys.argv:
   with Image.open(sys.argv[-1]) as image:pts,desc,size=features(image)
   np.savez_compressed(Path(__file__).with_name('flower_bird_features.npz'),points=pts,descriptors=desc,size=size)
   print(json.dumps({'features':len(pts),'size':size}))
  else:print(json.dumps(main(),allow_nan=False))
 except Exception as error:
  print(json.dumps({'matched':False,'error':str(error)}));sys.exit(1)
