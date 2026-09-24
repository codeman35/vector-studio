"""Direct curve drag regression with real pointer events and synthetic artwork.
Defaults to real local HTTP. VS_INJECT=1 is isolated HTML (not persistence).
VS_TEST_URL can run against a deployed site. Build before running.
"""
import copy, functools, http.server, json, math, os, shutil, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'; OUT.mkdir(exist_ok=True)
VERSION=json.loads((ROOT/'package.json').read_text())['version']
def node(x,y):return {'x':x,'y':y,'in':{'x':0,'y':0},'out':{'x':0,'y':0}}
def ring(points,closed=True):return {'closed':closed,'nodes':[node(x,y) for x,y in points]}
def shape(sid,rings,fill='#e60012',stroke='none',width=0):
 return {'id':sid,'name':sid,'fill':fill,'stroke':stroke,'strokeWidth':width,'visible':True,'locked':False,'source':'draw','rings':rings}
fixture={'format':'vector-studio','version':2,'name':'Curve drag','groups':[],'width':650,'height':450,'image':None,'shapes':[
 shape('body',[ring([(120,100),(360,100),(360,320),(120,320)]),ring([(190,180),(290,180),(290,260),(190,260)])]),
 shape('open',[ring([(450,220),(600,220)],False)],'none','#2868c7',3)]}
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1550,'height':1050});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  if os.getenv('VS_TEST_URL'):page.goto(os.environ['VS_TEST_URL'])
  elif os.getenv('VS_INJECT')=='1':page.set_content((ROOT/'dist/index.html').read_text())
  else:page.goto(f'http://127.0.0.1:{server.server_port}/')
  page.wait_for_function('(v)=>window.vectorStudio?.version===v',arg=VERSION)
  def snap():return page.evaluate('vectorStudio.snapshot()')
  def selected_keys():return sorted(page.locator('#overlays .anchor.selected').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("data-node"))'))
  def xy(x,y):return page.evaluate('([x,y])=>{const e=document.getElementById("editor"),p=e.createSVGPoint();p.x=x;p.y=y;const s=p.matrixTransform(e.getScreenCTM());return [s.x,s.y]}',[x,y])
  seq=[0]
  def load(curved=False):
   seq[0]+=1;f=copy.deepcopy(fixture);f['name']=f'Test {seq[0]}'
   if curved:f['shapes'][0]['rings'][0]['nodes'][0]['out']={'x':70,'y':-70};f['shapes'][0]['rings'][0]['nodes'][1]['in']={'x':-70,'y':-70}
   page.locator('#file-input').set_input_files({'name':'curve.vstudio','mimeType':'application/json','buffer':json.dumps(f).encode()})
   page.wait_for_function('(name)=>document.getElementById("unsaved-dialog").open||vectorStudio.snapshot().name===name',arg=f['name'])
   if page.locator('#unsaved-dialog').is_visible():page.click('#switch-discard')
   page.wait_for_function('(name)=>vectorStudio.snapshot().name===name',arg=f['name'])
   page.click('[data-tool=select]');page.mouse.dblclick(*xy(145,220));assert page.evaluate('vectorStudio.getTool()')=='node'
   assert page.evaluate('vectorStudio.selection()')==['body'];return snap()
  def down(x,y):page.mouse.move(*xy(x,y));page.mouse.down()
  def move(x,y):page.mouse.move(*xy(x,y),steps=7)
  def check_only_handles(before,after,sid='body',ri=0,i=0):
   a=copy.deepcopy(after);s=next(x for x in a['shapes'] if x['id']==sid);b=next(x for x in before['shapes'] if x['id']==sid)
   j=(i+1)%len(s['rings'][ri]['nodes']);s['rings'][ri]['nodes'][i]['out']=copy.deepcopy(b['rings'][ri]['nodes'][i]['out']);s['rings'][ri]['nodes'][j]['in']=copy.deepcopy(b['rings'][ri]['nodes'][j]['in'])
   assert a==before,'Unrelated geometry, anchors, names or colors changed'
  base=load();page.mouse.move(*xy(240,100));page.wait_for_function('document.getElementById("editor").dataset.curveDrag==="ready"')
  # The actual CSS cursor is an embedded arc, and its SVG loads under the CSP.
  cursor=page.locator('#objects path[data-id="body"]').evaluate('(e)=>getComputedStyle(e).cursor')
  assert 'data:image/svg+xml,' in cursor and '14 12' in cursor,cursor
  assert page.evaluate(r"""async()=>{const css=document.getElementById('editor').style.cursor;
   const url=css.match(/url\("([^"]+)"\)/)[1];return await new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(image.width===32&&image.height===32);
    image.onerror=()=>resolve(false);image.src=url;});}""")
  page.mouse.move(*xy(170,140));page.wait_for_function('!document.getElementById("editor").dataset.curveDrag')
  page.mouse.move(*xy(240,100));page.wait_for_function('document.getElementById("editor").dataset.curveDrag==="ready"')
  page.mouse.click(*xy(240,100));assert snap()==base and not page.evaluate('vectorStudio.dirty()') and page.locator('#undo-btn').is_disabled()
  assert selected_keys()==[], 'A segment click must not select its endpoint nodes'
  # Straight -> cubic, no anchor movement, one-step undo and exact redo.
  down(240,100);move(260,65);assert page.locator('#curve-drag-feedback path').count()==1
  current=snap();check_only_handles(base,current);assert current!=base
  assert selected_keys()==[], 'Segment drag must not create a node selection, even while dragging'
  page.screenshot(path=str(OUT/'direct-curve-drag.png'));page.mouse.up();bent=snap();assert page.evaluate('vectorStudio.dirty()')
  assert selected_keys()==[], 'Pointer-up must preserve the original empty node selection'
  r=bent['shapes'][0]['rings'][0]['nodes'];mid={k:.5*(r[0][k]+r[1][k])+.375*(r[0]['out'][k]+r[1]['in'][k]) for k in ['x','y']}
  assert abs(mid['x']-260)<.01 and abs(mid['y']-65)<.01,mid
  page.click('#undo-btn');assert snap()==base and page.locator('#undo-btn').is_disabled()
  page.click('#redo-btn');assert snap()==bent
  # Preserve intentionally selected endpoints and unrelated nodes; do not
  # replace with the segment's two endpoints or unconditionally clear them.
  for chosen in [[], [(120,100)], [(360,100)], [(120,320)], [(120,320),(360,320)], [(120,100),(360,100)]]:
   base=load()
   for index,anchor in enumerate(chosen):
    if index:page.keyboard.down('Shift')
    page.mouse.click(*xy(*anchor))
    if index:page.keyboard.up('Shift')
   before_keys=selected_keys();assert len(before_keys)==len(chosen)
   down(240,100);move(240,65)
   assert selected_keys()==before_keys, 'Drag preview changed node selection'
   page.mouse.up();assert selected_keys()==before_keys, 'Curve release changed node selection'
   check_only_handles(base,snap());assert snap()!=base
  # Clicking one endpoint afterwards must not move the other endpoint too.
  base=load();down(240,100);move(240,65);page.mouse.up();before=snap()
  assert selected_keys()==[]
  down(120,100);move(105,115);page.mouse.up();after=snap()
  assert selected_keys()==['body|0|0']
  assert after['shapes'][0]['rings'][0]['nodes'][1]==before['shapes'][0]['rings'][0]['nodes'][1]
  assert after['shapes'][0]['rings'][0]['nodes'][0]['x']!=before['shapes'][0]['rings'][0]['nodes'][0]['x']
  # Both directions work: pull outside, cross the original edge, push inside.
  base=load();down(240,100);move(240,65)
  assert page.locator('#editor').get_attribute('data-curve-drag')=='dragging'
  check_only_handles(base,snap());move(240,140);page.mouse.up();inside=snap();check_only_handles(base,inside)
  nodes=inside['shapes'][0]['rings'][0]['nodes'];y=.5*(nodes[0]['y']+nodes[1]['y'])+.375*(nodes[0]['out']['y']+nodes[1]['in']['y'])
  assert abs(y-140)<.01,y
  assert page.locator('#editor').get_attribute('data-curve-drag') is None
  page.click('#undo-btn');assert snap()==base
  # Returning to the press position is a true no-op, not a hidden L-to-C edit.
  base=load();down(240,100);move(240,60);move(240,100);page.mouse.up();assert snap()==base and not page.evaluate('vectorStudio.dirty()')
  # Escape, pointer cancellation, lost capture, blur all restore just the two handles.
  for cancel in ['Escape','pointercancel','lostpointercapture','blur']:
   base=load();down(240,100);move(250,50);assert snap()!=base
   if cancel=='Escape':page.keyboard.press('Escape')
   elif cancel=='blur':page.evaluate('window.dispatchEvent(new Event("blur"))')
   else:page.evaluate('(t)=>document.getElementById("editor").dispatchEvent(new PointerEvent(t,{pointerId:1,bubbles:true}))',cancel)
   page.mouse.up();assert snap()==base and not page.evaluate('vectorStudio.dirty()'),cancel
  # No-op and every cancellation restore intentional multi-node selection.
  for cancel in ['return','click','Escape','pointercancel','lostpointercapture','blur']:
   base=load();page.mouse.click(*xy(120,320));page.keyboard.down('Shift');page.mouse.click(*xy(360,320));page.keyboard.up('Shift')
   before_keys=selected_keys();assert len(before_keys)==2
   down(240,100)
   if cancel!='click':move(240,65)
   if cancel=='return':move(240,100)
   elif cancel=='Escape':page.keyboard.press('Escape')
   elif cancel=='blur':page.evaluate('window.dispatchEvent(new Event("blur"))')
   elif cancel not in ['return','click']:page.evaluate('(t)=>document.getElementById("editor").dispatchEvent(new PointerEvent(t,{pointerId:1,bubbles:true}))',cancel)
   page.mouse.up();assert selected_keys()==before_keys,cancel
   assert snap()==base and not page.evaluate('vectorStudio.dirty()'),cancel
  # Filled interior still marquees, and Shift can start a marquee directly on an edge.
  base=load();down(170,140);move(100,80);assert page.locator('#gesture rect').count()==1;page.mouse.up();assert snap()==base;assert page.locator('#overlays .anchor.selected').count()==1
  page.keyboard.down('Shift');down(240,98);move(370,110);page.mouse.up();page.keyboard.up('Shift');assert snap()==base;assert page.locator('#overlays .anchor.selected').count()>=2
  # A node still moves, not bends; Ctrl inserts and Alt deletes, with undo.
  base=load();down(120,100);move(110,80);page.mouse.up();assert snap()['shapes'][0]['rings'][0]['nodes'][0]['x']!=120;page.click('#undo-btn');assert snap()==base
  page.mouse.dblclick(*xy(145,220));page.keyboard.down('Control');page.mouse.click(*xy(240,100));page.keyboard.up('Control');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==5
  page.keyboard.down('Alt');page.mouse.click(*xy(240,100));page.keyboard.up('Alt');assert len(snap()['shapes'][0]['rings'][0]['nodes'])==4
  # Existing control handles still win hit testing over nearby curve segments.
  base=load(True);down(190,30);move(200,40);page.mouse.up();after=snap()
  assert after['shapes'][0]['rings'][0]['nodes'][0]['out']!=base['shapes'][0]['rings'][0]['nodes'][0]['out']
  assert after['shapes'][0]['rings'][0]['nodes'][1]==base['shapes'][0]['rings'][0]['nodes'][1]
  # Commit also processes a final pointer-up that had no preceding pointermove.
  base=load();page.evaluate('document.getElementById("editor").addEventListener("pointerdown",e=>window.testPointer=e.pointerId,{once:true})')
  down(240,100);x,y=xy(240,70)
  page.evaluate('([x,y])=>document.getElementById("editor").dispatchEvent(new PointerEvent("pointerup",{clientX:x,clientY:y,pointerId:window.testPointer,bubbles:true}))',[x,y])
  page.mouse.up();assert snap()!=base;check_only_handles(base,snap());page.click('#undo-btn');assert snap()==base
  # Exact non-midpoint dragging on an existing cubic.
  base=load(True);nodes=base['shapes'][0]['rings'][0]['nodes'];a,b=nodes[:2];t=.35;u=1-t
  q={k:u**3*a[k]+3*u*u*t*(a[k]+a['out'][k])+3*u*t*t*(b[k]+b['in'][k])+t**3*b[k] for k in ['x','y']}
  down(q['x'],q['y']);move(q['x']+20,q['y']+32);page.mouse.up();after=snap();check_only_handles(base,after);assert after!=base
  a,b=after['shapes'][0]['rings'][0]['nodes'][:2]
  at={k:u**3*a[k]+3*u*u*t*(a[k]+a['out'][k])+3*u*t*t*(b[k]+b['in'][k])+t**3*b[k] for k in ['x','y']}
  assert math.hypot(at['x']-q['x']-20,at['y']-q['y']-32)<.03,at
  # Hole edge and closing seam: only their respective handles change.
  for ri,i,start,end in [(1,0,(240,180),(240,155)),(0,3,(120,210),(90,210))]:
   base=load();down(*start);move(*end);page.mouse.up();assert snap()!=base;check_only_handles(base,snap(),ri=ri,i=i)
  # Editing one object never bends another, even when that object is under the cursor.
  base=load();down(525,220);move(525,180);page.mouse.up();assert snap()==base
  # Open segment, then project and SVG export retain the curve rather than pixels.
  page.mouse.dblclick(*xy(525,220));assert page.evaluate('vectorStudio.selection()')==['open'];base=snap();down(525,220);move(525,180);page.mouse.up();after=snap();check_only_handles(base,after,'open');assert after!=base
  page.click('#export-btn')
  with page.expect_download() as out:page.click('#export-svg')
  out.value.save_as(OUT/'dragged-curve.svg');assert 'C' in (OUT/'dragged-curve.svg').read_text();page.click('#close-export')
  with page.expect_download() as out:page.click('#backup-btn')
  out.value.save_as(OUT/'dragged-curve.vstudio');assert json.loads((OUT/'dragged-curve.vstudio').read_text())==after
  # Double click blank still exits. Ordinary select mode still moves entire objects.
  page.mouse.dblclick(*xy(45,410));assert page.evaluate('vectorStudio.getTool()')=='select';before=snap();down(145,220);move(155,235);page.mouse.up();assert snap()!=before
  assert not errors,errors
  print('PASS: direct line/cubic/hole/open/closing-edge drag; fixed anchors and neighboring segments; no automatic endpoint selection; prior single/multi-node selection and cancel preserved; next endpoint drag independent; arc cursor and inward/outward dragging; hover; click/no-op; cancel; inside/Shift marquee; node/handle priority; Ctrl/Alt; undo/redo; project/SVG; no page errors.')
  browser.close()
finally:server.shutdown();server.server_close()
