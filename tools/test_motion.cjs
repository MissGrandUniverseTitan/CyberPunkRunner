const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'assets/motion-support.js'),'utf8'),ctx);
const motion=ctx.window.AfterlightMotion;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const oldHtml=fs.readFileSync(path.join(__dirname,'fixtures/camera-v2.2.0.js'),'utf8');
class Vec {
 constructor(x=0,y=0,z=0){this.set(x,y,z);} set(x,y,z){Object.assign(this,{x,y,z});return this;}
 copy(v){return this.set(v.x,v.y,v.z);} clone(){return new Vec(this.x,this.y,this.z);}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
 addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
 length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const n=this.length()||1;this.x/=n;this.y/=n;this.z/=n;return this;}
 distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
 lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
 lerpVectors(a,b,t){return this.copy(a).lerp(b,t);}
}
class Box {
 constructor(min,max){this.min=min;this.max=max;}clone(){return new Box(this.min.clone(),this.max.clone());}
 containsPoint(p){return ['x','y','z'].every(k=>p[k]>=this.min[k]&&p[k]<=this.max[k]);}
 expandByScalar(s){for(const k of ['x','y','z']){this.min[k]-=s;this.max[k]+=s;}return this;}
}
class Ray {
 set(origin,direction){this.origin=origin.clone();this.direction=direction.clone();return this;}
 intersectBox(box,out){
  let lo=-Infinity,hi=Infinity;
  for(const k of ['x','y','z']){
   if(Math.abs(this.direction[k])<1e-12){if(this.origin[k]<box.min[k]||this.origin[k]>box.max[k])return null;continue;}
   let a=(box.min[k]-this.origin[k])/this.direction[k],b=(box.max[k]-this.origin[k])/this.direction[k];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);
  }
  if(hi<Math.max(lo,0))return null;return out.copy(this.origin).addScaledVector(this.direction,lo>=0?lo:hi);
 }
}
const T={MathUtils:{clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),lerp:(a,b,t)=>a+(b-a)*t},Ray};
const physics=html.slice(html.indexOf('  const catRadius ='),html.indexOf('  // ============================================================\n  // Orbit camera'));
const movement=html.slice(html.indexOf('  function movementTick('),html.indexOf('  function frame(now)'));
function simulate(deltas,obstacles=[],jump=false){
 const game=vm.createContext({Math,T,motion,V:(...p)=>new Vec(...p),cat:{position:new Vec(0,0,4),rotation:{y:0}},
 velocity:new Vec(),previousPosition:new Vec(0,0,4),previousRotation:0,previousTravel:0,travel:0,before:new Vec(),checkpoint:new Vec(),
 orbit:{yaw:0},resting:false,started:true,jump,jumpBuffer:0,coyoteTime:0,grounded:true,vy:0,solids:obstacles});
 vm.runInContext(physics+movement,game);
 const clock=motion.fixedClock();let peak=0,steps=0,maxRenderDelta=0;let previous=new Vec(0,0,4);
 for(const dt of deltas){const tick=clock.advance(dt);for(let i=0;i<tick.steps;i++){game.movementTick(clock.step,0,1,true,false);peak=Math.max(peak,game.cat.position.y);steps++;}
  const visible=new Vec().lerpVectors(game.previousPosition,game.cat.position,tick.alpha);
  if(steps)maxRenderDelta=Math.max(maxRenderDelta,visible.distanceTo(previous));previous=visible;
 }
 return {position:game.cat.position,velocity:game.velocity,peak,steps,maxRenderDelta,grounded:game.grounded,checkpoint:game.checkpoint};
}
const samples=[30,60,120,144].map(fps=>({fps,result:simulate(Array(fps*2).fill(1/fps),[],true)}));
for(const {fps,result:r} of samples){assert.equal(r.steps,120);assert.ok(r.grounded);assert.ok(r.maxRenderDelta<.23);assert.ok(Math.abs(r.position.z-samples[0].result.position.z)<1e-10);assert.ok(Math.abs(r.peak-samples[0].result.peak)<1e-10);}
const irregular=simulate(Array(40).fill([.012,.038]).flat(),[],true);assert.equal(irregular.steps,120);assert.equal(irregular.position.z,samples[0].result.position.z);
const wall={minX:-2,maxX:2,minZ:1,maxZ:1.2,bottom:0,top:4};
for(const fps of [30,60,144]){const r=simulate(Array(fps*3).fill(1/fps),[wall]);assert.ok(r.position.z>=1.2+.235-1e-9);assert.equal(r.position.y,0);}
const stale=motion.fixedClock();assert.equal(stale.advance(10).steps,6,'background stall cannot create an unbounded catch-up loop');stale.reset();assert.equal(stale.advance(1/144).steps,0);
console.log('PASS: actual movement/physics at 30/60/120/144 Hz and uneven frames: identical distance/jump height; wall collision and bounded catch-up');

function cameraTest(source){
 const c={position:new Vec(),fov:53,lookAt(){},updateProjectionMatrix(){}};
 const state=vm.createContext({Math,T,motion,V:(...p)=>new Vec(...p),camera:c,cat:{position:new Vec(0,0,4)},solids:[],yaw:.08,pitch:.27,cameraDistance:3.25,portraitMode:false,resting:false});
 const start=source.indexOf('  const target = V();',source.indexOf('// Orbit camera with collision'));
 const end=source.includes('  function applyQuality()')?source.indexOf('  function applyQuality()',start):source.indexOf('  // ============================================================\n  // Game loop',start);
 vm.runInContext(source.slice(start,end),state);
 for(let i=0;i<240;i++)state.updateCamera(1/60);
 let max=0;const speeds=[];
 for(let i=0;i<180;i++){const last=c.position.clone();state.cat.position.z-=3.65/60;state.updateCamera(1/60);const step=c.position.distanceTo(last);max=Math.max(max,step);speeds.push(step);}
 return {max,speeds};
}
const oldCamera=cameraTest(oldHtml),newCamera=cameraTest(html);
assert.ok(oldCamera.max>.1,'regression fixture reproduces the old snap');assert.ok(newCamera.max<.063,'continuous camera tracks without periodic position snaps');
console.log(`PASS: camera regression at 60 Hz: largest position step ${oldCamera.max.toFixed(3)}m -> ${newCamera.max.toFixed(3)}m`);
const boom=motion.cameraBoom(3.3);assert.equal(boom.update(3.3,1.1,1/60),1.1);
for(let i=0;i<120;i++)assert.equal(boom.update(3.3,i%2?3.3:1.1,1/60),1.1,'edge chatter cannot pump the camera in and out');
let last=1.1;for(let i=0;i<120;i++){const x=boom.update(3.3,3.3,1/60);assert.ok(x>=last&&x<=3.3);last=x;}assert.ok(last>3.29);
assert.ok(motion.dampAngle(Math.PI-.01,-Math.PI+.01,10,1/60)>Math.PI-.01,'angle wraps along shortest path');
console.log('PASS: camera collision clearance, edge hysteresis, smooth recovery and angle wrapping');
const q=motion.qualityGovernor();let tier=0;for(let i=0;i<600;i++){const n=q.sample(1/30);if(n!==null)tier=n;}assert.equal(tier,2);
let transitions=0;for(let i=0;i<2400;i++){const n=q.sample(1/60);if(n!==null){tier=n;transitions++;}}assert.equal(tier,0);assert.equal(transitions,2);
const stable=motion.qualityGovernor();for(let i=0;i<3600;i++)assert.equal(stable.sample(1/60),null);
for(const touch of [true,false]){const r=motion.renderScale(3840,2160,3,touch,0);assert.ok(3840*2160*r*r<=(touch?1400000:2200000)+1);}
console.log('PASS: quality reduces on sustained load, recovers with cooldown, remains stable at 60 Hz and caps large-screen pixel budgets');
