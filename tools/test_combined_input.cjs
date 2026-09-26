const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
class Element {
 constructor(id=''){this.id=id;this.dataset={};this.style={};this.handlers={};this.attrs={};this.captured=new Set();this.disabled=false;}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
 removeEventListener(type,fn){this.handlers[type]=this.handlers[type].filter(f=>f!==fn);}
 setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}blur(){}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id});}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 emit(type,options={}){const e={preventDefault(){this.prevented=true;},stopPropagation(){},pointerType:'touch',button:0,isPrimary:false,...options};for(const fn of this.handlers[type]??[])fn(e);return e;}
}
class Vec {constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}copy(v){return this.set(v.x,v.y,v.z);}toArray(){return [this.x,this.y,this.z];}}
function setup(){
 const buttons=['run','jump'].map(action=>{const b=new Element('touch-'+action);b.dataset.action=action;return b;});
 const joystick=new Element(),canvas=new Element(),knob=new Element(),handlers={};
 const document={querySelectorAll:()=>buttons,addEventListener(){},hidden:false,body:{classList:{remove(){},toggle(){}}}};
 const g=vm.createContext({window:{},Math,Set,document,addEventListener:(name,fn)=>{handlers[name]=fn;},
  keys:new Set(),jump:false,jumpBuffer:0,coyoteTime:0,actionPresses:[],touchRun:false,touchMove:{x:0,z:0},
  started:true,grounded:true,vy:0,resting:false,portraitMode:false,journalOpen:false,activeDialog:null,
  ui:{touchRun:buttons[0],journal:new Element(),menu:new Element()},velocity:new Vec(),cat:{position:new Vec(0,0,4),rotation:{y:0}},
  previousPosition:new Vec(0,0,4),previousRotation:0,previousTravel:0,travel:0,before:new Vec(),checkpoint:new Vec(),orbit:{yaw:0},
  T:{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},solids:[],closeDialog(){},setPortrait(){},meow(){},zoom(){},resetCat(){}});
 vm.runInContext(fs.readFileSync(path.join(root,'assets/game-support.js'),'utf8')+fs.readFileSync(path.join(root,'assets/motion-support.js'),'utf8'),g);
 g.support=g.window.AfterlightSupport;g.motion=g.window.AfterlightMotion;
 vm.runInContext(html.slice(html.indexOf('  function clearInput()'),html.indexOf('  const canvas = renderer.domElement;')),g);
 vm.runInContext(html.slice(html.indexOf('  const catRadius ='),html.indexOf('  // ============================================================\n  // Orbit camera')),g);
 vm.runInContext(html.slice(html.indexOf('  function movementTick('),html.indexOf('  function frame(now)')),g);
 g.controller=g.support.touchController({joystick,knob,canvas,enabled:()=>true,onMove:(x,z)=>{g.touchMove.x=x;g.touchMove.z=z;},onOrbit(){},onZoom(){}});
 const tick=(n=1)=>{for(let i=0;i<n;i++)g.movementTick(1/60,
  Number(g.keys.has('KeyD'))-Number(g.keys.has('KeyA'))+g.touchMove.x,
  Number(g.keys.has('KeyW'))-Number(g.keys.has('KeyS'))+g.touchMove.z,true,g.touchRun||g.keys.has('ShiftLeft'));};
 return {g,buttons,joystick,canvas,handlers,tick};
}
const s=setup(),[run,jump]=s.buttons;
s.g.solids=[{minX:-1,maxX:1,minZ:1.8,maxZ:2.3,bottom:0,top:.55}];
s.joystick.emit('pointerdown',{pointerId:1,clientX:50,clientY:20,isPrimary:true});
run.emit('pointerdown',{pointerId:2});assert.equal(s.g.touchRun,true,'run starts on second finger DOWN, before release/click');
s.tick(13);assert.ok(s.g.velocity.z < -3.4);
jump.emit('pointerdown',{pointerId:3});assert.equal(s.g.jump,true,'third finger queues jump immediately');
assert.equal(s.g.touchMove.z,1);assert.equal(s.g.touchRun,true);
s.tick();assert.ok(s.g.vy>0);assert.ok(s.g.velocity.z < -3.4);assert.equal(s.g.grounded,false);
assert.ok(s.joystick.captured.has(1)&&run.captured.has(2)&&jump.captured.has(3));
jump.emit('pointerup',{pointerId:3});run.emit('pointerup',{pointerId:2});
run.emit('click',{detail:1});jump.emit('click',{detail:1});
assert.equal(s.g.touchRun,true,'synthesized click cannot toggle run off');assert.equal(s.g.jump,false,'synthesized click cannot jump twice');
assert.equal(s.g.touchMove.z,1,'releasing action fingers does not release direction');
s.tick(65);assert.ok(s.g.cat.position.z<1.8-.235,'running jump crosses the test hurdle');assert.equal(s.g.grounded,true);
console.log('PASS: actual bindings + physics: direction/run/jump on three simultaneous fingers cross a 0.55 m hurdle; run latch permits two-thumb play');
s.joystick.emit('pointercancel',{pointerId:1});assert.equal(s.g.touchMove.z,0);
run.emit('pointerdown',{pointerId:4});assert.equal(s.g.touchRun,false);run.emit('pointercancel',{pointerId:4});
assert.equal(run.captured.size,0);assert.equal(run.attrs['data-pressed'],undefined);
run.emit('click',{detail:0,pointerType:''});assert.equal(s.g.touchRun,true,'keyboard/assistive click remains supported');
run.disabled=true;run.emit('pointerdown',{pointerId:5});assert.equal(s.g.touchRun,true);run.disabled=false;
jump.emit('pointerdown',{pointerId:6});s.handlers.blur();assert.equal(s.g.touchRun,false);assert.equal(s.g.jump,false);assert.equal(s.g.jumpBuffer,0);assert.equal(jump.captured.size,0);
console.log('PASS: cancellation, duplicate-click suppression, accessibility activation, disabled actions and focus-loss reset');
const k=setup();const target={closest:selector=>selector==='button, summary'?{}:null};
for(const code of ['KeyW','ShiftLeft','Space'])k.handlers.keydown({code,target,repeat:false,preventDefault(){}});
assert.ok(k.g.keys.has('KeyW')&&k.g.keys.has('ShiftLeft'));assert.equal(k.g.jump,true);k.tick(6);assert.ok(k.g.cat.position.y>0);assert.ok(k.g.velocity.z < -2.5);
k.handlers.keyup({code:'Space'});assert.ok(k.g.keys.has('KeyW')&&k.g.keys.has('ShiftLeft'));
console.log('PASS: W + Shift + Space remains combined even when a game button had keyboard focus');
const buffered=setup();buffered.g.grounded=false;buffered.g.cat.position.y=.02;buffered.g.vy=-1;
buffered.g.action('jump');buffered.tick(3);assert.ok(buffered.g.vy>0,'jump pressed just before landing is buffered');
const edge=setup();edge.g.grounded=false;edge.g.cat.position.y=.8;edge.g.coyoteTime=.07;
edge.g.action('jump');edge.tick();assert.ok(edge.g.vy>0,'short ledge grace accepts a late press');
edge.g.action('jump');edge.tick(10);assert.equal(edge.g.jumpBuffer,0);assert.equal(edge.g.coyoteTime,0,'cannot double-jump in midair');
console.log('PASS: early landing input buffer, ledge grace and no midair double-jump');
const route=setup();
route.g.wood=0;route.g.rust=0;
route.g.cube=(w,h,d,x,y,z,material,solid=false)=>{if(solid)route.g.solids.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,bottom:y-h/2,top:y+h/2});};
vm.runInContext(html.slice(html.indexOf('  function crate('),html.indexOf('  for (let x = -2.4;',html.indexOf('  function crate('))),route.g);
route.g.cat.position.set(4,0,10.3);
route.joystick.emit('pointerdown',{pointerId:10,clientX:50,clientY:20});
route.buttons[0].emit('pointerdown',{pointerId:11});route.buttons[0].emit('pointerup',{pointerId:11});route.tick(13);
for(const [i,height] of [.55,1.25,1.95,2.65].entries()){
 route.buttons[1].emit('pointerdown',{pointerId:20+i});route.buttons[1].emit('pointerup',{pointerId:20+i});route.tick(65);
 assert.equal(route.g.grounded,true,'lands on route step '+i);
 assert.ok(Math.abs(route.g.cat.position.y-height)<1e-9,`route step ${i}: expected height ${height}, got ${route.g.cat.position.y}`);
 assert.equal(route.g.touchRun,true);assert.equal(route.g.touchMove.z,1);
}
console.log('PASS: actual level climbing route: continuous forward + run and four jump taps reach the 2.65 m balcony');
