const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sandbox = vm.createContext({ window: {}, Uint8Array });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/game-support.js'), 'utf8'), sandbox);
const load = sandbox.window.AfterlightSupport.loadModelParts;
const manifest = JSON.parse(fs.readFileSync(path.join(root,'assets/calico-v2/manifest.json'),'utf8'));
async function fetcher(url) {
  const relative = url.split('?')[0];
  const data = fs.readFileSync(path.join(root, relative));
  return { ok: true, json: async () => JSON.parse(data.toString()), arrayBuffer: async () => data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) };
}
(async () => {
  const result = await load('assets/calico-v2/', '2.2.0', fetcher);
  assert.equal(result.length, manifest.byteLength);
  assert.equal(crypto.createHash('sha256').update(result).digest('hex'),manifest.sha256);
  assert.equal(Buffer.from(result).readUInt32LE(0),0x46546c67);
  await assert.rejects(load('assets/calico-v2/','2.2.0',async () => ({ok:false})),/โหลดโมเดล/);
  await assert.rejects(load('assets/calico-v2/','2.2.0',async () => ({ok:true,json:async () => ({...manifest,parts:['../other.bin']})})),/ข้อมูลโมเดล/);
  await assert.rejects(load('assets/calico-v2/','2.2.0',async url => {
    if (url.includes('manifest.json')) return fetcher(url);
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};
  }),/ไฟล์โมเดลไม่ครบ/);
  console.log('PASS: actual game loader reassembles the exact GLB; missing, malformed and truncated parts fail safely');
})().catch(error=>{console.error(error);process.exitCode=1;});
