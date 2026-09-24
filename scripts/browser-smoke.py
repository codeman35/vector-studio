# Optional development test: pip install playwright; playwright install chromium
# Uses local HTML injection (no remote navigation), with a real Blob Worker.
# It does NOT validate GitHub Pages deployment, OS clipboard permission, or draft persistence.
from pathlib import Path
import os,shutil
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
import time
from playwright.sync_api import sync_playwright
out=ARTIFACTS
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1500,'height':980},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:print('Console:',m.type,m.text) if m.type=='error' else None)
 def wait(expression,timeout=12):
  end=time.time()+timeout
  while time.time()<end:
   if page.evaluate(expression):return
   page.wait_for_timeout(100)
  raise AssertionError('Timed out: '+expression+'; toast: '+page.locator('#toast').inner_text())
 page.on('dialog',lambda d:d.accept())
 page.add_locator_handler(page.locator('#unsaved-dialog'),lambda:page.click('#switch-discard'))
 page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load')
 wait('window.vectorStudio!==undefined')
 page.screenshot(path=str(out/'welcome.png'))
 print('Title:',page.title())
 page.click('#demo-btn');page.wait_for_timeout(100)
 print('Demo shapes',page.evaluate('window.vectorStudio.snapshot().shapes.length'))
 print('Anchors',page.locator('.anchor').count())
 page.screenshot(path=str(out/'editor.png'))
 a=page.locator('.anchor').first;box=a.bounding_box()
 before=page.evaluate('window.vectorStudio.snapshot().shapes[1].rings[0].nodes[0].x')
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+30,box['y']+10,steps=5);page.mouse.up()
 after=page.evaluate('window.vectorStudio.snapshot().shapes[1].rings[0].nodes[0].x')
 assert after!=before,(before,after)
 page.click('#undo-btn');assert page.evaluate('window.vectorStudio.snapshot().shapes[1].rings[0].nodes[0].x')==before
 page.click('#export-btn')
 with page.expect_download() as di:page.click('#export-svg')
 page.click('#close-export')
 di.value.save_as(str(out/'example.svg'))
 svg=(out/'example.svg').read_text();assert '<image' not in svg and '<path' in svg and 'fill-rule="evenodd"' in svg
 page.click('#new-btn');page.click('#raster-demo-btn')
 wait('window.vectorStudio.snapshot().image!==null')
 page.click('#trace-btn')
 wait('window.vectorStudio.snapshot().shapes.length>0',45)
 page.wait_for_timeout(100)
 snap=page.evaluate('window.vectorStudio.snapshot()')
 print('Traced shapes',len(snap['shapes']),'rings',[len(s['rings']) for s in snap['shapes']])
 assert len(snap['shapes'])==2
 assert any(len(s['rings'])==2 for s in snap['shapes'])
 page.screenshot(path=str(out/'traced.png'))
 with page.expect_download() as info:page.click('#backup-btn')
 info.value.save_as(str(out/'traced.vstudio'))
 page.click('#new-btn');page.locator('#file-input').set_input_files(str(out/'traced.vstudio'))
 wait('window.vectorStudio.snapshot().shapes.length===2')
 assert page.evaluate('window.vectorStudio.snapshot().shapes[0].source')=='trace'
 print('Errors:',errors);assert not errors
 browser.close()
