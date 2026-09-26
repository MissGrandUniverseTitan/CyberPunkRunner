const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/game-support.js'), 'utf8'), context);
const { stick, parseSave, saveStore, touchController } = context.window.AfterlightSupport;
const plain = value => JSON.parse(JSON.stringify(value));
const state = { version: 1, game: 'afterlight', savedAt: Date.now(), position: [1, 0, 3], rotation: .5,
  camera: { yaw: .3, pitch: .27, distance: 3.25 }, discovered: [0, 2], resting: true };
let writes = 0;
const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { writes++; memory.set(key, value); } };
const saves = saveStore(() => storage, 4);
assert.equal(saves.read().state, null);
assert.equal(saves.write(state), true);
assert.deepEqual(plain(saveStore(() => storage, 4).read().state), state, 'survives a fresh store instance');
for (const change of [{version: 2}, {position: [0, 0, 99]}, {position: ['1', 0, 0]}, {camera: {yaw: 0, pitch: 0, distance: 3}}, {discovered: [4]}, {resting: 1}, {savedAt: -1}]) {
  assert.equal(parseSave(JSON.stringify({...state, ...change}), 4), null);
  assert.equal(saves.write({...state, ...change}), false);
}
assert.equal(writes, 1, 'invalid states never overwrite a valid save');
assert.equal(parseSave('{broken', 4), null);
assert.equal(parseSave('x'.repeat(20001), 4), null);
assert.deepEqual(plain(parseSave(JSON.stringify({...state, discovered: [0,0,2]}),4).discovered), [0,2]);
const unavailable = saveStore(() => {throw Error('SecurityError');},4);
assert.equal(unavailable.read().issue,'storage'); assert.equal(unavailable.write(state),false);
const full = saveStore(() => ({setItem(){throw Error('QuotaExceededError');}}),4);
assert.equal(full.write(state),false);
memory.set('afterlight.save.v1','broken'); assert.equal(saves.read().issue,'invalid');
assert.equal(memory.get('afterlight.save.v1'),'broken','reading never destroys existing data');
assert.deepEqual(plain(stick(1,1,30)),{x:0,z:0,px:0,py:0});
assert.equal(stick(0,-30,30).z,1);
assert.ok(stick(15,0,30).x > 0 && stick(15,0,30).x < 1);
assert.ok(Math.abs(Math.hypot(stick(90,90,30).x, stick(90,90,30).z)-1)<1e-10);
class Element {
  constructor(){this.handlers={};this.style={};this.captured=new Set();}
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  removeEventListener(type,fn){this.handlers[type]=this.handlers[type].filter(f=>f!==fn);}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id});}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  emit(type,fields){for(const fn of this.handlers[type]??[])fn({preventDefault(){},pointerType:'touch',button:0,isPrimary:false,...fields});}
}
const joystick=new Element(),knob=new Element(),canvas=new Element();
let allowed=true, movement=[0,0], orbit=[], zoom=[];
const controller=touchController({joystick,knob,canvas,enabled:()=>allowed,onMove:(...v)=>movement=v,onOrbit:(...v)=>orbit.push(v),onZoom:v=>zoom.push(v)});
joystick.emit('pointerdown',{pointerId:1,clientX:80,clientY:50}); assert.deepEqual(plain(movement),[1,0]);
canvas.emit('pointerdown',{pointerId:2,clientX:100,clientY:100});
canvas.emit('pointermove',{pointerId:2,clientX:110,clientY:105});
assert.deepEqual(orbit,[[10,5]],'second finger orbits while joystick is held'); assert.equal(movement[0],1);
canvas.emit('pointerdown',{pointerId:3,clientX:210,clientY:105});
canvas.emit('pointermove',{pointerId:3,clientX:310,clientY:105}); assert.equal(zoom[0],.5);
canvas.emit('pointerup',{pointerId:3});
canvas.emit('pointermove',{pointerId:2,clientX:115,clientY:106}); assert.deepEqual(orbit.at(-1),[5,1],'no jump after pinch ends');
joystick.emit('pointercancel',{pointerId:99}); assert.equal(movement[0],1,'unrelated pointer cannot release joystick');
joystick.emit('pointercancel',{pointerId:1}); assert.deepEqual(movement,[0,0]);
joystick.emit('pointerdown',{pointerId:4,clientX:80,clientY:50}); controller.reset();
assert.deepEqual(movement,[0,0]); assert.equal(canvas.captured.size,0); assert.equal(joystick.captured.size,0);
allowed=false;joystick.emit('pointerdown',{pointerId:5,clientX:80,clientY:50});assert.deepEqual(movement,[0,0]);
controller.destroy();assert.equal(canvas.handlers.pointerdown.length,0);
console.log('PASS: save validation, reload, corrupt/blocked/full storage, analog input, simultaneous touch, pinch, cancellation and reset');

// Execute the real game save/restore/action functions with a minimal scene, not copies.
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const section=html.slice(html.indexOf('  function clearInput()'),html.indexOf("  document.querySelectorAll('[data-action]')"));
class Vec {constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}copy(v){return this.set(v.x,v.y,v.z);}toArray(){return [this.x,this.y,this.z];}}
const element=()=>({style:{},setAttribute(){}});
let blocked=false;
const game=vm.createContext({console,Date,Math,Set,controller:undefined,keys:new Set(),jump:false,jumpBuffer:0,coyoteTime:0,actionPresses:[],touchRun:false,touchMove:{x:0,z:0},velocity:new Vec(),
 ui:{touchRun:element(),saveState:element(),menu:{open:false},journal:element()},started:false,portraitMode:false,savedOrbit:null,yaw:.3,pitch:.27,cameraDistance:3.25,
 checkpoint:new Vec(1,0,3),cat:{position:new Vec(),rotation:{y:.5}},saves:saveStore(()=>storage,4),discovered:new Set([0,2]),resting:true,
 solids:[],overlap:()=>true,blocked:()=>blocked,vy:3,grounded:false,updateJournal(){},toast(){},activeDialog:null,journalOpen:false,
 interact(){},meow(){},setPortrait(){},resetCat(){},zoom(){},closeDialog(){}});
vm.runInContext(section,game);
const before=writes;assert.equal(game.saveGame(),false);assert.equal(writes,before,'cover does not overwrite saved progress');
game.started=true;assert.equal(game.saveGame(),true);
game.cat.position.set(4,2,5); // airborne position is deliberately not saved
assert.deepEqual(plain(saves.read().state.position),[1,0,3]);
game.portraitMode=true;game.cameraDistance=1.15;game.savedOrbit={yaw:.8,pitch:.4,cameraDistance:4};
assert.equal(game.saveGame(),true);assert.equal(saves.read().state.camera.distance,4,'portrait saves walking camera');
game.portraitMode=false;assert.equal(game.restoreGame(state),true);assert.deepEqual(game.cat.position.toArray(),state.position);
assert.deepEqual([...game.discovered],[0,2]);assert.equal(game.vy,0);assert.equal(game.grounded,true);
blocked=true;assert.equal(game.restoreGame(state),false);assert.deepEqual(game.cat.position.toArray(),[0,0,10.5]);assert.deepEqual([...game.discovered],[0,2]);
blocked=false;assert.equal(game.restoreGame({...state,position:[0,2,0]}),false,'unsupported checkpoint returns to entrance');
game.keys.add('KeyW');game.touchRun=true;game.jump=true;game.clearInput();assert.equal(game.keys.size,0);assert.equal(game.jump,false);assert.equal(game.touchRun,false);
game.action('journal');assert.equal(game.journalOpen,true);game.action('close');assert.equal(game.journalOpen,false);
console.log('PASS: game save/restore integration, grounded checkpoint, portrait camera, unsafe spawn recovery and input reset');

const handlers = {}, documentHandlers = {};
game.addEventListener = (name, callback) => { handlers[name] = callback; };
game.document = { hidden: false, addEventListener(name, callback){ documentHandlers[name] = callback; } };
vm.runInContext(html.slice(html.indexOf("  addEventListener('keyup', event => keys.delete"),html.indexOf('  const canvas = renderer.domElement;',html.indexOf("  addEventListener('keyup', event => keys.delete"))),game);
const writesBeforeHide=writes;
game.touchMove.x=1;game.keys.add('KeyW');game.document.hidden=true;documentHandlers.visibilitychange();
assert.equal(writes,writesBeforeHide+1,'backgrounding saves immediately');assert.equal(game.keys.size,0);assert.equal(game.touchMove.x,0);
handlers.pagehide();assert.equal(writes,writesBeforeHide+2,'leaving the page saves immediately');
const afterHide=writes;game.started=false;handlers.pagehide();assert.equal(writes,afterHide,'leaving cover does not overwrite progress');
game.started=true;game.resume={state};game.touchMode=true;game.performance={now:()=>12345};game.lastAutoSave=0;
game.document.body={classList:{add(){}}};game.ui.cover=element();game.ui.play={blur(){}};game.ui.newGame={blur(){}};
vm.runInContext(html.slice(html.indexOf('  function startGame(useSaved)'),html.indexOf('  ui.play.disabled = false;',html.indexOf('  function startGame(useSaved)'))),game);
let motionResets = 0; game.resetMotion = () => { motionResets++; };
game.startGame(true);assert.equal(motionResets,1);assert.deepEqual(game.cat.position.toArray(),state.position);assert.deepEqual([...game.discovered],state.discovered);
assert.equal(game.ui.cover.style.display,'none');assert.equal(game.lastAutoSave,12345);assert.equal(saves.read().state.resting,true);
console.log('PASS: actual pagehide/visibility handlers and Continue launch restore progress before saving');
