"""Independent reader check, not a Photoshop application compatibility claim.
Run after browser-workspace.py; psd-tools/Pillow are CI-only dependencies.
"""
from pathlib import Path
from psd_tools import PSDImage
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'artifacts'
for name in ['workspace','donut']:
 path=ROOT/(name+'.psd');psd=PSDImage.open(path)
 all_layers=list(psd.descendants());shapes=[s for s in all_layers if not s.is_group()]
 assert len(shapes)==2,[(s.name,s.kind) for s in all_layers]
 for layer in shapes:
  assert layer.has_vector_mask(),(layer.name,layer.kind)
  assert layer.tagged_blocks.get_data(b'SoCo') is not None,layer.name
  assert len(layer.vector_mask.paths)>=1,layer.name
  print(name,layer.name,layer.kind,'vector subpaths',len(layer.vector_mask.paths))
 if name=='workspace':
  assert len(psd)==1 and psd[0].is_group() and len(psd[0])==2
 else:assert any(len(s.vector_mask.paths)>1 for s in shapes),'Donut lost vector hole'
 im=Image.open(path);im.load();assert im.mode=='RGBA';assert im.getchannel('A').getextrema()==(0,255)
 im.save(ROOT/(name+'-independent.png'))
print('PASS: independent PSD parser recognizes solid fills, vector paths and group hierarchy; preview decodes with alpha. Photoshop acceptance still pending.')
