"""Validate the GLB skin and movement envelope against the actual game motion."""
import json, subprocess, numpy as np
import render_cat as r
skin=r.doc['skins'][0]
assert len(skin['joints'])==12
for ni,v,f,n,c,mat in r.geo:
 if 'skin' not in r.doc['nodes'][ni]:continue
 attrs=r.doc['meshes'][r.doc['nodes'][ni]['mesh']]['primitives'][0]['attributes']
 weights=r.attribute(attrs['WEIGHTS_0']);joints=r.attribute(attrs['JOINTS_0'])
 assert np.allclose(weights.sum(1),1) and (weights>=0).all()
 assert joints.max()<12 and f.max()<len(v)
 assert not r.doc['accessors'][attrs['JOINTS_0']].get('normalized',False)
body=next(g for g in r.geo if r.doc['nodes'][g[0]]['name']=='Continuous fluffy tail')
assert len(body[1])==81*24
poses=json.loads(subprocess.check_output(['node','-e',"global.window={};require('./assets/game-support.js');console.log(JSON.stringify(['idle','run','rest'].flatMap(mode=>Array.from({length:20},(_,i)=>({mode,pose:window.AfterlightSupport.tailPose(i*.4,mode)})))));"],cwd=r.ROOT))
lowest=100;largest=0
for sample in poses:
 for ji,p in zip(skin['joints'],sample['pose']):
  x,y,z=np.array([p['x'],p['y'],p['z']])/2;cx,cy,cz=np.cos([x,y,z]);sx,sy,sz=np.sin([x,y,z])
  r.doc['nodes'][ji]['rotation']=[sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]
 r.worlds=[r.world(i) for i in range(len(r.doc['nodes']))]
 ni,v,f,n,c,mat=body;wv,wn=r.transformed(ni,v,n)
 assert np.isfinite(wv).all() and np.isfinite(wn).all()
 y=wv[:,1].min()-(.14 if sample['mode']=='rest' else 0)
 lowest=min(lowest,y);assert y>.06,(sample['mode'],y)
 # Adjacent surface rings remain connected with bounded stretching in every pose.
 spans=np.linalg.norm(np.diff(wv.reshape(81,24,3),axis=0),axis=2)
 largest=max(largest,spans.max());assert spans.max()<.027
print(f'PASS: 12-joint GLB skin, normalized weights, 60 poses, minimum floor clearance {lowest:.3f}m, max adjacent ring spacing {largest:.3f}m')
