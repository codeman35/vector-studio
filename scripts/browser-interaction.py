# Optional development test: pip install playwright; playwright install chromium
# Uses local HTML injection (no remote navigation), with a real Blob Worker.
# It does NOT validate GitHub Pages deployment, OS clipboard permission, or draft persistence.
import json,time
from pathlib import Path
import os,shutil
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
from playwright.sync_api import sync_playwright
root=ROOT;out=ARTIFACTS

def shape(sid,x,y,w,h):
 return {'id':sid,'name':sid,'fill':'#247a70','stroke':'none','strokeWidth':0,'visible':True,'locked':False,'rings':[{'closed':True,'nodes':[{'x':a,'y':b,'in':{'x':0,'y':0},'out':{'x':0,'y':0}} for a,b in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]}]}
fixture={'format':'vector-studio','version':1,'name':'UI test','width':600,'height':400,'image':None,'shapes':[shape('first',100,100,180,180),shape('second',220,100,180,180)]}
(out/'fixture.vstudio').write_text(json.dumps(fixture))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1500,'height':980})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.set_content((root/'dist/index.html').read_text())
 def wait(exp):
  for _ in range(100):
   if page.evaluate(exp):return
   page.wait_for_timeout(80)
  raise AssertionError(exp+' '+page.locator('#toast').inner_text())
 def load():
  page.locator('#file-input').set_input_files(str(out/'fixture.vstudio'));wait('window.vectorStudio.snapshot().shapes.length===2')
 def xy(x,y):return page.evaluate('([x,y])=>{const svg=document.getElementById("editor"),p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(svg.getScreenCTM());return [q.x,q.y]}',[x,y])
 def select_all():page.click('[data-tool=select]');page.locator('#editor').focus();page.keyboard.press('Control+a')
 load();select_all();page.click('[data-tab=properties]');page.click('[data-boolean=union]');wait('window.vectorStudio.snapshot().shapes.length===1')
 assert page.evaluate('window.vectorStudio.snapshot().shapes[0].rings.length')==1
 page.click('#undo-btn');wait('window.vectorStudio.snapshot().shapes.length===2');page.click('#redo-btn');wait('window.vectorStudio.snapshot().shapes.length===1')
 page.click('[data-tool=knife]');a=xy(250,60);z=xy(250,320);page.mouse.move(*a);page.mouse.down();page.mouse.move(*z,steps=8);page.mouse.up();wait('window.vectorStudio.snapshot().shapes.length===2')
 assert len(page.evaluate('window.vectorStudio.selection()'))==2
 page.click('[data-tool=select]');page.mouse.click(*xy(500,50));page.mouse.click(*xy(150,150));page.click('[data-tab=properties]');page.click('[title="填充 #c76659"]')
 assert page.evaluate('window.vectorStudio.snapshot().shapes.filter(s=>s.fill==="#c76659").length')==1
 # Curve insertion and deletion through pointer interaction.
 page.click('[data-tool=add]');page.mouse.click(*xy(150,100));snap=page.evaluate('window.vectorStudio.snapshot()');sid=page.evaluate('window.vectorStudio.selection()[0]')
 current=next(s for s in snap['shapes'] if s['id']==sid);nodes=len(current['rings'][0]['nodes']);assert nodes>=5
 page.locator('#editor').focus();page.keyboard.press('Delete')
 current=next(s for s in page.evaluate('window.vectorStudio.snapshot().shapes') if s['id']==sid);assert len(current['rings'][0]['nodes'])==nodes-1
 # True scissors opens a contour, undo restores it.
 page.click('[data-tool=scissors]');page.mouse.click(*xy(150,100));assert page.evaluate('window.vectorStudio.snapshot().shapes.some(s=>!s.rings[0].closed)')
 page.click('#undo-btn');assert page.evaluate('window.vectorStudio.snapshot().shapes.every(s=>s.rings[0].closed)')
 # Draw a rectangle using the tool, not direct model mutation.
 before=page.evaluate('window.vectorStudio.snapshot().shapes.length');page.click('[data-tool=rect]');page.mouse.move(*xy(420,310));page.mouse.down();page.mouse.move(*xy(510,365),steps=5);page.mouse.up();assert page.evaluate('window.vectorStudio.snapshot().shapes.length')==before+1
 page.screenshot(path=str(out/'interaction.png'))
 # Synthetic clipboard event covers paste handler, not OS clipboard permissions.
 page.click('#new-btn')
 page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=50;c.height=50;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,50,50);ctx.fillStyle='black';ctx.fillRect(10,10,30,30);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'paste.png',{type:'image/png'}));window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt}));}''')
 wait('window.vectorStudio.snapshot().image!==null');page.click('#trace-btn');wait('window.vectorStudio.snapshot().shapes.length===1')
 # Color mode uses a real Worker, re-trace replaces old trace objects.
 page.click('[data-tab=trace]');page.select_option('#trace-mode','color');page.click('#trace-btn');wait('document.getElementById("busy").hidden');assert page.evaluate('window.vectorStudio.snapshot().shapes.length')==1
 assert not errors,errors
 print('PASS: union, undo/redo, knife, recolor, add/delete node, scissors, draw rectangle, paste handler, color re-trace; no page errors.')
 b.close()
