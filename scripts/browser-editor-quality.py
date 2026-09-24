"""Actual Worker, default smooth/red geometry and in-place editing regression.
Default isolated single HTML; VS_TEST_URL enables source / served build testing.
Synthetic fixtures only. This test does not claim cloud persistence coverage.
"""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
VERSION=json.loads((ROOT/'package.json').read_text())['version']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 if os.getenv('VS_TEST_URL'):page.goto(os.environ['VS_TEST_URL'])
 else:page.set_content((ROOT/'dist/index.html').read_text())
 page.wait_for_function('(v)=>window.vectorStudio?.version===v',arg=VERSION)
 def snap():return page.evaluate('vectorStudio.snapshot()')
 def ready():page.wait_for_function('()=>vectorStudio.preview().ready&&!vectorStudio.preview().pending')
 def xy(x,y):return page.evaluate('([x,y])=>{const e=document.getElementById("editor"),p=e.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(e.getScreenCTM());return [q.x,q.y]}',[x,y])
 def drag(a,c):page.mouse.move(*xy(*a));page.mouse.down();page.mouse.move(*xy(*c),steps=8);page.mouse.up()
 assert page.locator('#trace-curve-type').input_value()=='cubic'
 assert page.locator('#trace-preserve-corners').is_checked()
 assert page.locator('#trace-curve-type').is_disabled()
 # Generate a raster ring with a hard rectangle beside it.
 page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=500;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,500,300);x.fillStyle='black';x.beginPath();x.arc(140,150,100,0,2*Math.PI);x.fill();x.fillStyle='white';x.beginPath();x.arc(140,150,40,0,2*Math.PI);x.fill();x.fillStyle='black';x.fillRect(300,60,130,170);const b=await new Promise(r=>c.toBlob(r)),dt=new DataTransfer();dt.items.add(new File([b],'quality.png',{type:'image/png'}));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));}''')
 ready();base=snap();smooth=page.locator('#trace-preview path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')
 assert any('C' in d for d in smooth) and any('L' in d for d in smooth)
 assert page.locator('#trace-preview path').first.get_attribute('stroke')=='#cc0010'
 page.select_option('#trace-curve-type','polygon');ready();poly=page.locator('#trace-preview path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))');assert poly!=smooth
 page.select_option('#trace-curve-type','cubic');ready();assert snap()==base
 page.screenshot(path=str(OUT/'adaptive-preview-v050.png'))
 page.click('#trace-btn');page.wait_for_function('()=>vectorStudio.snapshot().shapes.length===2')
 generated=snap();assert all(s['fill']=='#e60012' for s in generated['shapes'])
 assert page.locator('#objects path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')==smooth
 smooth_count=sum(len(r['nodes']) for s in generated['shapes'] for r in s['rings'])
 page.mouse.dblclick(*xy(80,150));assert page.evaluate('vectorStudio.getTool()')=='node'
 assert page.locator('#node-edit-notice').is_visible()
 # Hole double-click stays in editing, never interpreted as outside.
 page.mouse.dblclick(*xy(140,150));assert page.evaluate('vectorStudio.getTool()')=='node';assert snap()==generated
 # Inside-fill marquee still works, with no movement or dirty/history change.
 drag((100,120),(245,260));assert page.locator('#overlays .anchor.selected').count()>0;assert snap()==generated
 page.screenshot(path=str(OUT/'red-node-edit-v050.png'))
 page.mouse.dblclick(*xy(470,280));assert page.evaluate('vectorStudio.getTool()')=='select'
 assert page.locator('#overlays .anchor').count()==0 and page.locator('#node-edit-notice').is_hidden();assert snap()==generated
 # New double-click enters another object. Single blank clicks only clear nodes.
 page.mouse.dblclick(*xy(350,100));assert page.evaluate('vectorStudio.getTool()')=='node'
 page.mouse.click(*xy(480,280));assert page.evaluate('vectorStudio.getTool()')=='node'
 page.mouse.dblclick(*xy(480,280));assert page.evaluate('vectorStudio.getTool()')=='select'
 page.click('#undo-btn');assert snap()==base
 page.click('#redo-btn');assert snap()==generated
 # Existing user-set fill persists across exit/enter and download.
 page.mouse.dblclick(*xy(350,100));page.locator('#fill-color').evaluate("e=>{e.value='#123456';e.dispatchEvent(new Event('change',{bubbles:true}));}")
 page.mouse.dblclick(*xy(480,280));saved=snap();assert any(s['fill']=='#123456' for s in saved['shapes'])
 page.click('#export-btn')
 with page.expect_download() as d:page.click('#export-svg')
 d.value.save_as(OUT/'quality.svg');text=(OUT/'quality.svg').read_text();assert '#123456' in text and 'C' in text and 'evenodd' in text
 assert not errors,errors
 print('PASS:',VERSION,'default fitted curves / protected lines / red fill / preview-Apply parity / nodes',smooth_count,'/ inside marquee / doubleclick exit / hole retention / undo-redo / custom color / SVG; no page errors.')
 b.close()
