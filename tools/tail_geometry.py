"""Continuous, tapered tail with a 12-joint skin shared by coat and fine fur."""
import numpy as np

def build_tail(api):
 node,mesh,accessor=api['node'],api['mesh'],api['accessor']
 doc,root,fur=api['DOC'],api['root'],api['FUR']
 black,orange=api['BLACK'],api['ORANGE']
 count=12;length=.88;base=np.array([0,.65,.47]);rng=np.random.default_rng(4207)
 joints=[];prev=root
 for i in range(count):
  prev=node('tail'+str(i),prev,base if i==0 else [0,0,length/(count-1)])
  joints.append(prev)
 inverse=np.repeat(np.eye(4)[None],count,axis=0)
 for i in range(count):inverse[i,:3,3]=-(base+[0,0,length*i/(count-1)])
 skin=len(doc.setdefault('skins',[]))
 doc['skins'].append({'name':'Continuous tail skin','joints':joints,'skeleton':joints[0],
  'inverseBindMatrices':accessor(inverse.transpose(0,2,1).reshape(count,16).astype(np.float32),'MAT4')})
 def weights(vertices):
  t=np.clip((vertices[:,2]-base[2])/length,0,1)*(count-1)
  lo=np.minimum(np.floor(t).astype(int),count-2);a=t-lo
  js=np.zeros((len(t),4),np.uint16);js[:,0]=lo;js[:,1]=lo+1
  ws=np.zeros((len(t),4),np.float32);ws[:,0]=1-a;ws[:,1]=a
  return js,ws
 def add(name,v,f,n,c):
  mesh(name,v,f,n,c,fur,root)
  ni=len(doc['nodes'])-1;doc['nodes'][ni]['skin']=skin
  attrs=doc['meshes'][doc['nodes'][ni]['mesh']]['primitives'][0]['attributes']
  js,ws=weights(v);attrs['JOINTS_0']=accessor(js,'VEC4',34962);attrs['WEIGHTS_0']=accessor(ws,'VEC4',34962)
 def paint(v):
  t=(v[:,2]-base[2])/length
  bands=.5+.5*np.sin(t*19+np.sin(v[:,0]*40)*.4)
  blend=np.clip((bands-.35)/.3,0,1);blend=blend*blend*(3-2*blend)
  blend*=1-np.clip((t-.72)/.13,0,1)
  return black+(orange-black)*blend[:,None]
 rings=81;sides=24;t=np.linspace(0,1,rings)
 # Rounded, gently tapering silhouette; no open end or separate tip ball.
 r=.058*(1-.36*t)*np.sqrt(np.maximum(0,1-t**5));angle=np.arange(sides)*2*np.pi/sides
 radial=np.stack([np.cos(angle),np.sin(angle),np.zeros(sides)],1)
 v=(base+[0,0,0]+t[:,None,None]*np.array([0,0,length])+r[:,None,None]*radial).reshape(-1,3)
 slope=np.gradient(r,t*length)
 n=np.broadcast_to(radial,(rings,sides,3)).copy();n[:,:,2]=-slope[:,None]
 n=n.reshape(-1,3);n/=np.linalg.norm(n,axis=1)[:,None]
 f=[]
 for i in range(rings-1):
  for j in range(sides):
   a=i*sides+j;b=i*sides+(j+1)%sides;c=a+sides;d=b+sides
   f.extend([[a,b,c],[b,d,c]])
 f=np.array(f);add('Continuous fluffy tail',v,f,n,paint(v))
 # Fine opaque tapered strands share the same skin, so the coat never detaches.
 samples=1600;u=rng.uniform(.02,.98,samples);theta=rng.uniform(0,2*np.pi,samples)
 radius=np.interp(u,t,r);normal=np.c_[np.cos(theta),np.sin(theta),np.zeros(samples)]
 roots=base+np.c_[radius*np.cos(theta),radius*np.sin(theta),u*length]
 tangent=np.c_[-np.sin(theta),np.cos(theta),np.zeros(samples)]
 hairlen=rng.uniform(.008,.017,samples)*(1-u*.35);width=rng.uniform(.0005,.001,samples)
 tips=roots+normal*hairlen[:,None]*.65+np.array([0,0,1])*hairlen[:,None]*.65
 vv=np.stack([roots-tangent*width[:,None],roots+tangent*width[:,None],tips],1).reshape(-1,3)
 add('Tail fine fur',vv,np.arange(samples*3).reshape(-1,3),np.repeat(normal,3,axis=0),np.repeat(paint(roots)*rng.uniform(.9,1.1,(samples,1)),3,axis=0))
 # A relaxed upright default pose also makes the GLB useful outside the game.
 for i,ji in enumerate(joints):
  angle=-.42 if i==0 else -.135
  doc['nodes'][ji]['rotation']=[np.sin(angle/2),0,0,np.cos(angle/2)]
