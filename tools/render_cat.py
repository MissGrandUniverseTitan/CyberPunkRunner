"""CPU geometry review render; no browser/WebGL dependency. Not a gameplay screenshot."""
from pathlib import Path
import pickle, json, struct, numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
doc,geo=pickle.loads((ROOT/'review/model-geometry.pkl').read_bytes())
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
def rotation(q):
 x,y,z,w=q
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def world(i):
 m=np.eye(4);m[:3,3]=doc['nodes'][i].get('translation',[0,0,0])
 m[:3,:3]=rotation(doc['nodes'][i].get('rotation',[0,0,0,1]))
 return world(parents[i])@m if i in parents else m
worlds=[world(i) for i in range(len(doc['nodes']))]
from model_parts import read_model
blob=read_model()
json_length=struct.unpack_from('<I',blob,12)[0]
binary=blob[28+json_length:]
def attribute(index):
 a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
 dtype={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8}[a['componentType']]
 components={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.frombuffer(binary,dtype=dtype,count=a['count']*components,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],components)
def transformed(ni,v,n):
 item=doc['nodes'][ni]
 if 'skin' not in item:
  m=worlds[ni];return v@m[:3,:3].T+m[:3,3],n@m[:3,:3].T
 skin=doc['skins'][item['skin']];attrs=doc['meshes'][item['mesh']]['primitives'][0]['attributes']
 joints=attribute(attrs['JOINTS_0']);weights=attribute(attrs['WEIGHTS_0'])
 inverse=attribute(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 mats=np.array([worlds[j]@inv for j,inv in zip(skin['joints'],inverse)])
 mixed=(mats[joints]*weights[:,:,None,None]).sum(axis=1)
 wv=np.einsum('nij,nj->ni',mixed,np.c_[v,np.ones(len(v))])[:,:3]
 wn=np.einsum('nij,nj->ni',mixed[:,:3,:3],n);wn/=np.maximum(np.linalg.norm(wn,axis=1)[:,None],1e-12)
 return wv,wn
def unit(x):return x/np.linalg.norm(x)
def render(eye,target,scale,width,height):
 eye=np.array(eye);target=np.array(target);fw=unit(target-eye);right=unit(np.cross(fw,[0,1,0]));up=np.cross(right,fw)
 basis=np.array([right,up,fw]);img=np.zeros((height,width,3),np.float32);img[:]=[.115,.145,.15]
 zbuf=np.full((height,width),np.inf)
 light=unit(eye-target+np.array([-1,2.4,-.5]));fill=unit([2,1,1])
 for ni,v,f,n,c,matid in geo:
  wv,wn=transformed(ni,v,n)
  p=(wv-target)@basis.T;screen=np.c_[width*.5+p[:,0]*scale,height*.5-p[:,1]*scale,p[:,2]]
  mat=doc['materials'][matid]['pbrMetallicRoughness'];base=np.array(mat['baseColorFactor'][:3],dtype=float)
  base=np.broadcast_to(base,(len(v),3)).copy()
  if c is not None:base*=c
  diffuse=np.maximum(wn@light,0);rim=np.maximum(wn@fill,0)
  color=base*(.35+diffuse[:,None]*.76+rim[:,None]*.15)
  if mat['roughnessFactor']<.5:
   view=unit(eye-target);half=unit(light+view)
   spec=np.maximum(wn@half,0)**(40 if matid!=8 else 8)
   color+=spec[:,None]*(.06 if matid==1 else .3)
  color=np.clip(color,0,1)**(1/2.2)
  for face in f:
   pts=screen[face];x0=max(0,int(np.floor(pts[:,0].min())));x1=min(width-1,int(np.ceil(pts[:,0].max())))
   y0=max(0,int(np.floor(pts[:,1].min())));y1=min(height-1,int(np.ceil(pts[:,1].max())))
   if x0>x1 or y0>y1:continue
   a,b,c0=pts;den=(b[1]-c0[1])*(a[0]-c0[0])+(c0[0]-b[0])*(a[1]-c0[1])
   if abs(den)<1e-7:continue
   yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
   wa=((b[1]-c0[1])*(xx-c0[0])+(c0[0]-b[0])*(yy-c0[1]))/den
   wb=((c0[1]-a[1])*(xx-c0[0])+(a[0]-c0[0])*(yy-c0[1]))/den;wc=1-wa-wb
   depth=wa*a[2]+wb*b[2]+wc*c0[2];mask=(wa>=0)&(wb>=0)&(wc>=0)&(depth<zbuf[y0:y1+1,x0:x1+1])
   if not mask.any():continue
   zbuf[y0:y1+1,x0:x1+1][mask]=depth[mask]
   shade=wa[:,:,None]*color[face[0]]+wb[:,:,None]*color[face[1]]+wc[:,:,None]*color[face[2]]
   img[y0:y1+1,x0:x1+1][mask]=shade[mask]
 return Image.fromarray((img*255).astype('uint8'))
if __name__ == '__main__':
 canvas=Image.new('RGB',(1600,1000),'#1d2526')
 canvas.paste(render((1.2,1.35,-3),(0,.85,-.32),660,750,850),(0,95))
 canvas.paste(render((0,1,-3),(0,.66,0),400,350,780),(750,145))
 canvas.paste(render((3,1,0),(0,.66,0),225,500,780),(1100,145))
 draw=ImageDraw.Draw(canvas)
 font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
 big=ImageFont.truetype(font,32);small=ImageFont.truetype(font,17)
 draw.text((36,25),'AFTERLIGHT / CALICO V2.1 / SOFT FACE',font=big,fill='#ecd7b4')
 draw.text((38,68),'Actual 3D geometry review | software render, not a gameplay screenshot',font=small,fill='#aab8b4')
 draw.text((300,955),'FACE / THREE-QUARTER',font=small,fill='#d9c8aa')
 draw.text((890,955),'FRONT',font=small,fill='#d9c8aa');draw.text((1340,955),'SIDE',font=small,fill='#d9c8aa')
 canvas.save(ROOT/'review/calico-v2-review.png')
 print(ROOT/'review/calico-v2-review.png')
