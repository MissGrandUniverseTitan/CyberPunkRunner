"""Package the exact GLB into small binary parts for reliable repository uploads."""
from pathlib import Path
import hashlib, json
ROOT=Path(__file__).resolve().parents[1]
def package_model(blob):
 folder=ROOT/'assets/calico-v2';folder.mkdir(exist_ok=True)
 names=[]
 for i,offset in enumerate(range(0,len(blob),393216)):
  name=f'part-{i:02d}.bin';names.append(name);(folder/name).write_bytes(blob[offset:offset+393216])
 for old in folder.glob('part-*.bin'):
  if old.name not in names:old.unlink()
 manifest={'version':1,'byteLength':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'parts':names}
 (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 return manifest

def read_model():
 folder=ROOT/'assets/calico-v2';manifest=json.loads((folder/'manifest.json').read_text())
 blob=b''.join((folder/name).read_bytes() for name in manifest['parts'])
 assert len(blob)==manifest['byteLength'] and hashlib.sha256(blob).hexdigest()==manifest['sha256']
 return blob

if __name__=='__main__':
 print(json.dumps(package_model((ROOT/'assets/calico-v2.glb').read_bytes())))
