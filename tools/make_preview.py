"""Package the exact game + GLB into a single review HTML. CDN access is still needed."""
from pathlib import Path
import argparse, base64, hashlib
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('output',type=Path);args=parser.parse_args()
from model_parts import read_model
model=read_model()
html=(root/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="./assets/mobile.css?v=2.2.0">', '<style>'+ (root/'assets/mobile.css').read_text() + '</style>')
html=html.replace('<script src="./assets/game-support.js?v=2.2.0"></script>', '<script>'+ (root/'assets/game-support.js').read_text() + '</script>')
payload=base64.b64encode(model).decode('ascii')
html=html.replace('<script type="module">', '<script id="calico-model" type="application/octet-stream">'+payload+'</script>\n<script type="module">',1)
args.output.write_text(html)
print(f'{args.output}\nGLB SHA256: {hashlib.sha256(model).hexdigest()}')
