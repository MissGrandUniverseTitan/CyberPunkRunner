"""Build AFTERLIGHT's articulated calico mesh. Python 3 + NumPy; no downloaded assets.
Coordinates: metres, Y up, facing -Z. Regenerate with: python tools/build_cat.py
The GLB uses named transform joints driven by the game's existing animation loop.
"""
from pathlib import Path
import json, struct, math
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(240923)
WHITE=np.array([.90,.86,.78]); ORANGE=np.array([.61,.285,.105]); BLACK=np.array([.045,.032,.028])
DOC={'asset':{'version':'2.0','generator':'AFTERLIGHT calico sculpt v2.2 soft face and flowing tail'},'scene':0,'scenes':[{'nodes':[0]}],
     'nodes':[],'meshes':[],'materials':[],'bufferViews':[],'accessors':[],'buffers':[]}
BINARY=bytearray()
GEOMETRY=[]

def material(name,color,roughness=.8,metal=0):
 DOC['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1], 'roughnessFactor':roughness,'metallicFactor':metal},'doubleSided':True})
 return len(DOC['materials'])-1
FUR=material('Calico coat / vertex colour',[1,1,1],.9)
EYE=material('Amber-green iris',[1,1,1],.34)
DARK=material('Soft charcoal harness',[.027,.035,.038],.85)
TRIM=material('Warm woven piping',[.28,.17,.095],.85)
PINK=material('Rose nose',[.62,.31,.29],.46)
MOUTH=material('Mouth and nostrils',[.095,.048,.041],.9)
PUPIL=material('Deep pupils',[.004,.009,.006],.13)
GLINT=material('Eye catchlights',[1,.97,.86],.15)
GOLD=material('Aged brass buckle',[.42,.27,.11],.4,.65)
HAIR=material('Pale whiskers',[.9,.84,.7],.9)

def node(name,parent=None,translation=None,rotation=None):
 n={'name':name}
 if translation is not None:n['translation']=list(translation)
 if rotation is not None:n['rotation']=list(rotation)
 i=len(DOC['nodes']);DOC['nodes'].append(n)
 if parent is not None:DOC['nodes'][parent].setdefault('children',[]).append(i)
 return i

def accessor(arr,kind,target=None):
 arr=np.ascontiguousarray(arr)
 while len(BINARY)%4:BINARY.append(0)
 start=len(BINARY);BINARY.extend(arr.tobytes())
 view={'buffer':0,'byteOffset':start,'byteLength':arr.nbytes}
 if target:view['target']=target
 vi=len(DOC['bufferViews']);DOC['bufferViews'].append(view)
 ct={np.dtype('float32'):5126,np.dtype('uint32'):5125,np.dtype('uint16'):5123,np.dtype('uint8'):5121}[arr.dtype]
 a={'bufferView':vi,'componentType':ct,'count':len(arr),'type':kind}
 if arr.dtype==np.uint8:a['normalized']=True
 if kind in ['VEC3','SCALAR'] and arr.dtype==np.float32:
  a['min']=np.atleast_1d(arr.min(axis=0)).tolist();a['max']=np.atleast_1d(arr.max(axis=0)).tolist()
 ai=len(DOC['accessors']);DOC['accessors'].append(a)
 return ai

def mesh(name,verts,faces,normals,colors,mat,parent):
 v=np.asarray(verts,dtype=np.float32);f=np.asarray(faces,dtype=np.uint32);n=np.asarray(normals,dtype=np.float32)
 assert np.isfinite(v).all() and np.isfinite(n).all(), name
 # Reject collapsed triangles at UV poles.
 good=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)>1e-10
 f=f[good]
 attrs={'POSITION':accessor(v,'VEC3',34962),'NORMAL':accessor(n,'VEC3',34962)}
 c=None
 if colors is not None:
  c=np.clip(np.asarray(colors),0,1)
  attrs['COLOR_0']=accessor(np.c_[c,np.ones(len(v))].__mul__(255).astype(np.uint8),'VEC4',34962)
 prim={'attributes':attrs,'indices':accessor(f.reshape(-1),'SCALAR',34963),'material':mat}
 mi=len(DOC['meshes']);DOC['meshes'].append({'name':name,'primitives':[prim]})
 ni=node(name,parent);DOC['nodes'][ni]['mesh']=mi
 GEOMETRY.append((ni,v,f,n,c,mat))
 return v,f,n,c

def normalize(v):return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-12)
def smoothmin(a,b,k):
 h=np.clip(.5+.5*(b-a)/k,0,1)
 return b*(1-h)+a*h-k*h*(1-h)
def sdf(parts,k=.035):
 def evaluate(p):
  result=None
  for center,radii in parts:
   r=np.array(radii);d=(np.linalg.norm((p-center)/r,axis=-1)-1)*r.min()
   result=d if result is None else smoothmin(result,d,k)
  return result
 return evaluate

def sphere_grid(nu=96,nv=64):
 u=np.linspace(0,2*np.pi,nu+1);v=np.linspace(0,np.pi,nv+1)
 u,v=np.meshgrid(u,v)
 dirs=np.stack([np.sin(v)*np.cos(u),np.cos(v),np.sin(v)*np.sin(u)],axis=-1).reshape(-1,3)
 ids=np.arange((nu+1)*(nv+1)).reshape(nv+1,nu+1)
 a=ids[:-1,:-1].ravel();b=a+1;c=a+nu+1;d=c+1
 faces=np.concatenate([np.stack([a,b,c],1),np.stack([b,d,c],1)])
 return dirs,faces

def sculpt(name,parts,parent,paint,k=.035,nu=96,nv=64,origin=(0,0,0),fur=0,sockets=False):
 fn=sdf(parts,k)
 if sockets:
  outer=fn
  def fn(p):
   result=outer(p)
   for side in [-1,1]:
    r=np.array([.084,.069,.073]);d=(np.linalg.norm((p-[side*.118,.045,-.192])/r,axis=-1)-1)*r.min()
    result=-smoothmin(-result,d,.008)
   return result
 dirs,faces=sphere_grid(nu,nv);o=np.array(origin)
 lo=np.zeros(len(dirs));hi=np.full(len(dirs),2.)
 for _ in range(27):
  mid=(hi+lo)/2;inside=fn(o+dirs*mid[:,None])<0
  lo=np.where(inside,mid,lo);hi=np.where(inside,hi,mid)
 verts=o+dirs*((lo+hi)/2)[:,None]
 e=.0001;axes=np.eye(3)*e
 normals=normalize(np.stack([fn(verts+a)-fn(verts-a) for a in axes],axis=-1))
 cross=np.cross(verts[faces[:,1]]-verts[faces[:,0]],verts[faces[:,2]]-verts[faces[:,0]])
 if np.mean(np.sum(cross*normals[faces[:,0]],axis=1))<0:faces=faces[:,[0,2,1]]
 colors=paint(verts)
 data=mesh(name,verts,faces,normals,colors,FUR,parent)
 if fur:fur_layer(name+' / fur',*data,parent=parent,paint=paint,count=fur)
 return data

def ellipsoid(name,center,radii,parent,mat,color=None,nu=48,nv=32):
 d,f=sphere_grid(nu,nv);r=np.array(radii);v=d*r+center;n=normalize(d/r)
 if np.mean(np.sum(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])*n[f[:,0]],axis=1))<0:f=f[:,[0,2,1]]
 c=color(v) if callable(color) else np.tile(color,(len(v),1)) if color is not None else None
 return mesh(name,v,f,n,c,mat,parent)

def coat_noise(p):
 return .005*np.sin(p[:,0]*113+np.sin(p[:,1]*53))*np.sin(p[:,2]*89+p[:,1]*67)
def face_paint(p):
 x,y,z=p.T;noise=coat_noise(p);c=np.tile(ORANGE,(len(p),1))
 black=((x<-.033+noise)&(y>-.085))|((x>.085+noise)&(y>.115+noise))|((z>.075)&(np.sin(x*27+y*12)>-.2))
 c[black]=BLACK
 front=z<-.09
 blaze=(np.abs(x+.005+np.sin(y*23)*.006)<.021+np.maximum(.13-y,0)*.13+noise*.2)&(y<.22)
 cheek=(y<-.085+noise*.4)|((np.abs(x)>.11)&(y<-.035)&(z<-.095))
 muzzle=(z<-.195)&(y<.015)
 white=(front&(blaze|cheek))|muzzle
 c[white]=WHITE
 stripes=(np.sin(y*115+x*31+np.sin(x*40))>.7)&(~white)&(~black)&(y>.06)
 c[stripes]*=.57
 c*=1+(.055*np.sin(x*165+y*29+z*111))[:,None]
 return np.clip(c,0,1)
def body_paint(p):
 x,y,z=p.T;noise=coat_noise(p);c=np.tile(ORANGE,(len(p),1))
 field=np.sin(z*12+x*7)+.65*np.cos(y*15-z*8)+.4*np.sin(x*28-z*4)
 c[field>.1+noise]=BLACK
 white=(y<.49+noise)|((z<-.29+noise)&(np.abs(x)<.18))
 c[white]=WHITE
 c*=1+(.06*np.sin(z*190+x*37+y*73))[:,None]
 return np.clip(c,0,1)
def solid(color):return lambda p:np.tile(color,(len(p),1))

def fur_layer(name,v,f,n,c,parent,paint,count=3000):
 area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)
 tri=f[rng.choice(len(f),count,p=area/area.sum())]
 uv=rng.random((count,2));uv=np.where((uv.sum(1)>1)[:,None],1-uv,uv)
 w=np.c_[1-uv.sum(1),uv]
 roots=np.sum(v[tri]*w[:,:,None],1);norm=normalize(np.sum(n[tri]*w[:,:,None],1))
 # Keep coat strands outside the eye apertures and eyelids.
 if name.startswith('Sculpted face'):
  keep=np.ones(count,dtype=bool)
  for side in [-1,1]:
   xx=roots[:,0]-side*.118;yy=roots[:,1]-.044-side*xx*.09
   keep &= ~((xx/.078)**2+(yy/.049)**2<1) | (roots[:,2]>-.08)
  roots=roots[keep];norm=norm[keep];count=len(roots)
 groom=np.tile([0,-1,.2],(count,1));groom=normalize(groom-norm*np.sum(groom*norm,axis=1)[:,None])
 length=rng.uniform(.007,.016,count)
 tips=roots+norm*length[:,None]*.52+groom*length[:,None]*.65
 tangent=normalize(np.cross(norm,groom));width=rng.uniform(.0005,.0011,count)
 vv=np.stack([roots-tangent*width[:,None],roots+tangent*width[:,None],tips],1).reshape(-1,3)
 nn=np.repeat(norm,3,axis=0)
 cc=paint(roots)*rng.uniform(.8,1.18,(count,1));cc=np.repeat(cc,3,axis=0)
 mesh(name,vv,np.arange(count*3).reshape(-1,3),nn,cc,FUR,parent)

def tube(name,points,radius,parent,mat,color=None,sides=7):
 pts=np.array(points);tang=normalize(np.gradient(pts,axis=0));axis=np.tile([0,1,0.],(len(pts),1))
 axis[np.abs(tang[:,1])>.94]=[1,0,0]
 u=normalize(np.cross(tang,axis));w=normalize(np.cross(tang,u))
 ang=np.arange(sides)*2*np.pi/sides
 normal=u[:,None,:]*np.cos(ang)[None,:,None]+w[:,None,:]*np.sin(ang)[None,:,None]
 r=np.broadcast_to(radius,(len(pts),))
 v=(pts[:,None,:]+normal*r[:,None,None]).reshape(-1,3)
 f=[]
 for i in range(len(pts)-1):
  for j in range(sides):
   a=i*sides+j;b=i*sides+(j+1)%sides;c=a+sides;d=b+sides
   f.extend([[a,b,c],[b,d,c]])
 colors=color(v) if callable(color) else np.tile(color,(len(v),1)) if color is not None else None
 mesh(name,v,f,normal.reshape(-1,3),colors,mat,parent)

def curve(a,b,c,n=24):
 t=np.linspace(0,1,n)[:,None];return (1-t)**2*np.array(a)+2*t*(1-t)*np.array(b)+t*t*np.array(c)

root=node('catBody')
sculpt('Continuous torso',[
 ((0,.64,.045),(.235,.238,.48)),((0,.66,-.23),(.22,.262,.26)),((0,.59,.33),(.248,.255,.245)),
 ((0,.735,-.35),(.165,.245,.175)),((0,.46,.06),(.16,.12,.33))],root,body_paint,k=.055,origin=(0,.62,0),fur=6000)
head=node('head',root,(0,.89,-.445))
# A broad, continuous cheek-to-muzzle transition keeps the face soft.
face_parts=[
 ((0,.008,.008),(.25,.205,.21)),
 ((.131,-.052,-.068),(.120,.103,.131)),
 ((-.131,-.052,-.068),(.120,.103,.131)),
 ((.048,-.086,-.177),(.072,.060,.068)),
 ((-.048,-.086,-.177),(.072,.060,.068)),
 ((0,-.135,-.139),(.105,.055,.085)),
 ((0,.012,-.158),(.058,.115,.070))]
face_surface=sdf(face_parts,.041)
def front_surface(x,y):
 # Intersect the actual uncut face surface, so lids and eyes follow the cheek.
 x=np.asarray(x);y=np.asarray(y);lo=np.full(x.shape,-.5);hi=np.zeros(x.shape)
 for _ in range(32):
  mid=(lo+hi)/2;outside=face_surface(np.stack([x,y,mid],-1))>0
  lo=np.where(outside,mid,lo);hi=np.where(outside,hi,mid)
 return (lo+hi)/2
sculpt('Sculpted face',face_parts,head,face_paint,k=.041,nu=128,nv=80,fur=14000)
# Nose: softly triangular flesh, separate nostrils and fine lip line.
verts=np.array([[-.033,-.034,-.268],[.033,-.034,-.268],[0,-.069,-.278],[0,-.038,-.286],[0,-.030,-.253]])
faces=np.array([[0,2,3],[3,2,1],[0,3,4],[3,1,4],[0,4,2],[1,2,4]])
verts[:,2]+=.024
normals=normalize(verts-np.array([0,-.045,-.231]))
mesh('Triangular rose nose',verts,faces,normals,None,PINK,head)
for side in [-1,1]:
 ellipsoid('Nostril', [side*.024,-.047,-.250],[.006,.003,.0025],head,MOUTH,nu=16,nv=12)
 tube('Smile',curve([0,-.093,-.245],[side*.024,-.105,-.239],[side*.050,-.098,-.230]),.0018,head,MOUTH)
tube('Philtrum',[[0,-.066,-.254],[0,-.080,-.249],[0,-.094,-.244]],.0018,head,MOUTH)

def almond_surface(name,parent,side,inner=0,outer=1,coat=False):
 # A shallow corneal mesh follows the facial contour. Maximum lift is 4 mm;
 # there is no separate projecting spherical eyeball or pupil geometry.
 sectors=128;steps=32 if inner==0 else 4
 rs=np.linspace(inner,outer,steps+1)
 angles=np.linspace(0,2*np.pi,sectors+1)
 r,a=np.meshgrid(rs,angles,indexing='ij');r=r.ravel();a=a.ravel()
 x=.068*r*np.cos(a)
 shape=np.sin(a)*np.abs(np.sin(a))**.25
 y=r*np.where(shape>=0,.040,.032)*shape+side*x*.09
 worldx=x+side*.118;worldy=y+.044
 surface=front_surface(worldx,worldy)
 z=surface-.0015-.0025*np.maximum(0,1-r*r)
 vv=np.stack([x,y,z],-1)
 ids=np.arange(len(vv)).reshape(steps+1,sectors+1)
 aa=ids[:-1,:-1].ravel();bb=aa+1;cc=aa+sectors+1;dd=cc+1
 ff=np.concatenate([np.stack([aa,cc,bb],1),np.stack([bb,cc,dd],1)])
 nn=np.zeros_like(vv)
 normals=np.cross(vv[ff[:,1]]-vv[ff[:,0]],vv[ff[:,2]]-vv[ff[:,0]])
 for j in range(3):np.add.at(nn,ff[:,j],normals)
 nn=normalize(nn)
 if np.mean(nn[:,2])>0:nn=-nn;ff=ff[:,[0,2,1]]
 if coat:
  color=face_paint(np.stack([worldx,worldy,surface],-1))
  # Narrow dark lash edge; the outer lid blends back into coat colour.
  color[r<1.035]=[.037,.025,.018]
  mat=FUR
 else:
  iris_r=np.sqrt((x/.047)**2+(y/.047)**2)
  theta=np.arctan2(y,x)
  ring=np.clip(iris_r,0,1)
  color=(1-ring[:,None])*np.array([.58,.39,.095])+ring[:,None]*np.array([.20,.25,.06])
  grain=(.022*np.sin(theta*91+ring*13)+.012*np.cos(theta*53))*np.clip(1-ring,0,1)
  color+=grain[:,None]
  color[iris_r>1]=[.05,.065,.025]
  pupil=np.sqrt((x/.023)**2+((y-.001)/.030)**2)
  weight=np.clip((pupil-.96)/.06,0,1)[:,None]
  color=color*weight+np.array([.004,.007,.004])*(1-weight)
  shine=((x+.012)/.0048)**2+((y-.017)/.006)**2<1
  color[shine]=[.88,.85,.73]
  mat=EYE
 mesh(name,vv,ff,nn,color,mat,parent)
 lift=float(np.max(surface-z))
 assert lift<=.00401, 'Eye surface protrudes too far'
 return lift

for side,label in [(1,'L'),(-1,'R')]:
 eye=node('eye'+label,head,(side*.118,.044,0))
 almond_surface('Inset almond eye '+label,eye,side)
 almond_surface('Blended eyelid '+label,eye,side,inner=1,outer=1.11,coat=True)
 # Cupped tapered ears: curved triangular shell, not a cone or flat card.
 ear=node('ear'+label,head,(side*.158,.132,.006))
 vv=[];ff=[];cc=[]
 rows=28;cols=24
 for back in [False,True]:
  offset=len(vv)
  for i in range(rows+1):
   t=i/rows;width=.105*(1-t)**.72+.004
   for j in range(cols+1):
    u=j/cols*2-1;x=u*width+side*.035*t;y=t*.235
    z=(.018 if back else -.035)+(.026*(1-u*u)*np.sin(t*np.pi) if not back else .014*np.sin(t*np.pi))
    vv.append([x,y,z]);base=BLACK if side>0 else ORANGE
    if not back and .08<t<.90 and abs(u)<.75:base=np.array([.29,.145,.10])*(.8+.3*t)
    cc.append(base)
  for i in range(rows):
   for j in range(cols):
    a=offset+i*(cols+1)+j;b=a+1;c=a+cols+1;d=c+1
    ff.extend([[a,c,b],[b,c,d]] if not back else [[a,b,c],[b,d,c]])
 vv=np.array(vv);ff=np.array(ff);nn=np.zeros_like(vv)
 for tri in ff:
  cross=np.cross(vv[tri[1]]-vv[tri[0]],vv[tri[2]]-vv[tri[0]])
  nn[tri]+=cross
 mesh('Ear shell '+label,vv,ff,normalize(nn),cc,FUR,ear)
 for j in range(18):
  x=rng.uniform(-.066,.066);y=rng.uniform(.02,.08)
  tube('Ear hair '+label,curve([x,y,-.04],[x*.7,y+.055,-.055],[x*.45,y+.085,-.045],8),np.linspace(.00065,.0001,8),ear,HAIR,sides=3)

whiskers=node('whiskers',head,(0,0,.024))
for side in [-1,1]:
 for i in range(6):
  tube('Whisker',curve([side*.075,-.085-i*.007,-.267],[side*.225,-.035-i*.025,-.285],[side*(.34+i*.007),.002-i*.035,-.20],22),np.linspace(.0011,.00015,22),whiskers,HAIR,sides=3)
 for j in range(3):
  tube('Brow hair',curve([side*.1,.12,-.18],[side*.18,.2+j*.013,-.17],[side*.22,.225+j*.014,-.12],14),np.linspace(.0008,.00015,14),head,HAIR,sides=3)

# Each leg is a seamless sculpt around a local shoulder/hip pivot.
for side,label in [(1,'L'),(-1,'R')]:
 for rear,code in [(False,'F'),(True,'B')]:
  x=side*.158;z=.30 if rear else -.29;pivot=.47
  leg=node('leg'+label+code,root,(x,pivot,z))
  def leg_paint(p,x=x,z=z):
   world=p+np.array([x,pivot,z]);c=body_paint(world)
   c[p[:,1]<-.22]=WHITE
   return c
  sculpt('Limb '+label+code,[
   ((0,-.075,.024 if rear else 0),(.105 if rear else .071,.17,.105 if rear else .075)),
   ((0,-.25,.03 if rear else 0),(.050,.15,.057)),
   ((0,-.405,-.039),(.075,.061,.106))],leg,leg_paint,k=.02,nu=64,nv=48,origin=(0,-.23,0),fur=1400)
  for off in [-.025,.025]:
   tube('Toe seam',curve([off,-.39,-.123],[off,-.415,-.141],[off,-.433,-.13],10),.0012,leg,MOUTH,sides=3)
# Harness: a slim chest loop and girth loop plus broad saddle straps.
for name,cy,cz,rx,ry in [('Girth',.644,.05,.248,.248),('Chest',.755,-.345,.173,.20)]:
 a=np.linspace(0,2*np.pi,100)
 pts=np.stack([rx*np.cos(a),cy+ry*np.sin(a),np.full(len(a),cz)],1)
 tube(name+' band',pts,.022,root,DARK,sides=10)
 for dz in [-.017,.017]:tube(name+' piping',pts+np.array([0,0,dz]),.0023,root,TRIM,sides=5)
for side in [-1,1]:
 pts=curve([side*.125,.89,-.31],[side*.19,.96,-.10],[side*.20,.83,.13],40)
 tube('Shoulder strap',pts,.026,root,DARK,sides=10)
 tube('Strap piping',pts+np.array([side*.02,.003,0]),.0025,root,TRIM,sides=5)
# Flat compact fabric saddle on the shoulders.
ellipsoid('Soft harness saddle',[0,.896,-.02],[.15,.025,.185],root,DARK)
a=np.linspace(0,2*np.pi,40);tube('Brass D ring',np.stack([.026*np.cos(a),np.full(len(a),.927),-.035+.034*np.sin(a)],1),.004,root,GOLD,sides=6)

from tail_geometry import build_tail
build_tail(globals())

# Portable preview clips. The game drives these named nodes itself.
DOC['animations']=[]
name_to_node={n['name']:i for i,n in enumerate(DOC['nodes'])}
def clip(name,duration,speed,amp):
 times=np.linspace(0,duration,25).astype(np.float32);channels=[];samplers=[];input_id=accessor(times,'SCALAR')
 for i,label in enumerate(['legLF','legLB','legRF','legRB']):
  phase=0 if i in [0,3] else np.pi;angle=np.sin(times/duration*np.pi*2+phase)*amp
  q=np.zeros((len(times),4),np.float32);q[:,0]=np.sin(angle/2);q[:,3]=np.cos(angle/2)
  samplers.append({'input':input_id,'output':accessor(q,'VEC4'),'interpolation':'LINEAR'})
  channels.append({'sampler':len(samplers)-1,'target':{'node':name_to_node[label],'path':'rotation'}})
 DOC['animations'].append({'name':name,'samplers':samplers,'channels':channels})
clip('Walk',.85,1,.4);clip('Run',.52,1,.6)
DOC['buffers']=[{'byteLength':len(BINARY)}]
js=json.dumps(DOC,separators=(',',':')).encode();js+=b' '*((-len(js))%4);BINARY+=b'\0'*((-len(BINARY))%4)
blob=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(BINARY))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BINARY),0x004E4942)+BINARY
out=ROOT/'assets/calico-v2.glb';out.write_bytes(blob)
from model_parts import package_model
package_model(blob)
print(json.dumps({'file':str(out),'bytes':len(blob),'meshes':len(GEOMETRY),'triangles':sum(len(g[2]) for g in GEOMETRY),'nodes':len(DOC['nodes'])}))
# Geometry cache is only a reproducible intermediate for the software preview.
if __name__=='__main__':
 import pickle
 (ROOT/'review/model-geometry.pkl').write_bytes(pickle.dumps((DOC,GEOMETRY)))
