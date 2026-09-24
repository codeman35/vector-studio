"""Actual curve controls and Blob Worker; CSP stays in force. Synthetic fixtures."""
import json,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
EXPECTED_VERSION=json.loads((ROOT/'package.json').read_text())['version']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':1100});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    if os.getenv('VS_TEST_URL'):page.goto(os.environ['VS_TEST_URL'])
    else:page.set_content((ROOT/'dist/index.html').read_text())
    def wait(expr):
        for _ in range(200):
            if page.evaluate(expr):return
            page.wait_for_timeout(100)
        raise AssertionError(expr+' '+str(errors))
    wait('window.vectorStudio !== undefined')
    assert page.evaluate('vectorStudio.version')==EXPECTED_VERSION
    assert page.locator('.version').inner_text().startswith(EXPECTED_VERSION)
    assert page.locator('#trace-curve-type').is_disabled()
    assert page.locator('#trace-curve-type').input_value()=='cubic'
    def ready():wait('vectorStudio.preview().ready && !vectorStudio.preview().pending')
    def paths():return page.locator('#trace-preview path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')
    def snapshot():return page.evaluate('vectorStudio.snapshot()')
    def value(v):page.locator('#trace-curve-smoothness').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(v))
    page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=360;c.height=260;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,360,260);x.fillStyle='#152a39';x.beginPath();x.arc(120,130,90,0,2*Math.PI);x.fill();x.fillStyle='white';x.beginPath();x.arc(120,130,38,0,2*Math.PI);x.fill();x.fillStyle='#152a39';x.fillRect(235,55,85,130);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'curve-demo.png',{type:'image/png'}));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));}''')
    ready();assert any('C' in d for d in paths())
    page.select_option('#trace-curve-type','polygon');ready();base=snapshot();poly=paths()
    assert all('C' not in d for d in poly)
    assert page.locator('#trace-curve-smoothness').is_disabled()
    page.select_option('#trace-curve-type','quadratic');ready();quad=paths()
    assert any('C' in d for d in quad) and quad!=poly
    assert not page.locator('#trace-curve-smoothness').is_disabled()
    assert snapshot()==base and page.locator('#undo-btn').is_disabled()
    page.select_option('#trace-curve-type','cubic');ready();cub=paths();assert cub!=quad
    page.uncheck('#trace-preserve-corners');ready();rounded=paths();assert rounded!=cub
    value(15);ready();low=paths();value(95);ready();high=paths();assert low!=high
    for typ in ['cubic','polygon','quadratic']:page.select_option('#trace-curve-type',typ)
    ready();latest=paths();assert page.evaluate('vectorStudio.preview().curveType')=='quadratic';assert snapshot()==base
    value(0);ready();assert paths()==poly
    value(60);ready();page.select_option('#trace-curve-type','cubic');ready();latest=paths()
    page.locator('#trace-curve-controls').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'bezier-controls-v050.png'))
    page.click('#trace-btn');wait('vectorStudio.snapshot().shapes.length>0')
    assert page.locator('#objects path').evaluate_all('(ps)=>ps.map(p=>p.getAttribute("d"))')==latest
    generated=snapshot();assert any(abs(n['out']['x'])+abs(n['out']['y'])>0 for s in generated['shapes'] for r in s['rings'] for n in r['nodes'])
    page.click('#undo-btn');assert snapshot()==base
    page.click('#redo-btn');assert snapshot()==generated
    page.click('#export-btn')
    with page.expect_download() as d:page.click('#export-svg')
    d.value.save_as(OUT/'curve-export.svg');assert 'C' in (OUT/'curve-export.svg').read_text()
    page.click('#close-export');page.click('[data-tab=trace]')
    page.uncheck('#live-preview');page.select_option('#trace-curve-type','quadratic');page.click('#trace-btn')
    wait('!vectorStudio.preview().applying && vectorStudio.preview().state==="applied"')
    assert snapshot()['shapes'] and snapshot()!=generated;assert not errors,errors
    print('PASS: default cubic, explicit polygon, Q/C Worker geometry, latest request, slider, corners, preview isolation, Apply, undo/redo, SVG, manual generation, CSP/version.')
    browser.close()
