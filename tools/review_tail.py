"""Review actual skinned tail vertices driven by the game's shared motion function."""
import json, subprocess, numpy as np
from PIL import ImageDraw, ImageFont
import render_cat as r
script="""global.window={};require('./assets/game-support.js');
console.log(JSON.stringify(Array.from({length:12},(_,i)=>window.AfterlightSupport.tailPose(i/12*Math.PI*2,'idle'))));"""
poses=json.loads(subprocess.check_output(['node','-e',script],cwd=r.ROOT))
# Keep complete meshes; omit tiny non-tail hairs only at this preview resolution.
r.geo=[g for g in r.geo if 'fur' not in r.doc['nodes'][g[0]]['name'].lower() or 'Tail' in r.doc['nodes'][g[0]]['name']]
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
frames=[]
for frame,pose in enumerate(poses):
 for i,p in enumerate(pose):
  # Three.js Euler XYZ quaternion, matching the game.
  x,y,z=np.array([p['x'],p['y'],p['z']])/2;cx,cy,cz=np.cos([x,y,z]);sx,sy,sz=np.sin([x,y,z])
  q=[sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]
  next(n for n in r.doc['nodes'] if n['name']=='tail'+str(i))['rotation']=q
 r.worlds=[r.world(i) for i in range(len(r.doc['nodes']))]
 image=r.render((3,1.3,.4),(0,.83,.23),230,620,420)
 d=ImageDraw.Draw(image);d.text((18,14),'FLOWING TAIL / continuous skin + fine fur',font=font,fill='#eadfc9')
 d.text((18,390),'Actual mesh + game motion | software preview, not gameplay',font=font,fill='#bac6c0')
 frames.append(image)
 print('Rendered',frame+1,flush=True)
frames[0].save(r.ROOT/'review/calico-flowing-tail.png')
frames[0].save(r.ROOT/'review/calico-flowing-tail.gif',save_all=True,append_images=frames[1:],duration=550,loop=0)
