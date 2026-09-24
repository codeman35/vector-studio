/** Fixed-graph ES-module bundler: reproducible, local-only, no runtime eval/CDN. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(resolve(root,p),'utf8');
function bundleModule(source,name,bindings=''){
  const exports=[...source.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_]\w*)/g)].map(m=>m[1]);
  const body=source.replace(/^import .*?;\s*$/mg,'').replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|function|class)\b)/g,'');
  if(/^import |\bexport (?:async |function|const|class)/m.test(body))throw new Error('Unsupported module syntax in '+name);
  return `const ${name} = (() => {\n${bindings}\n${body}\nreturn {${exports.join(',')}};\n})();`;
}
const geometry=bundleModule(await read('src/geometry.js'),'VSGeometry');
const groups=bundleModule(await read('src/groups.js'),'VSGroups');
const documentModule=bundleModule(await read('src/document.js'),'VSDocument','const {node,ring,pathData}=VSGeometry;const {validateGroups,ancestors,groupMap}=VSGroups;');
const trace=bundleModule(await read('src/trace.js'),'VSTrace','const {stitchEdges,signedArea,simplifyRing,groupRings,ring}=VSGeometry;');
const worker=`${geometry}\n${trace}\nself.onmessage=({data})=>{try{self.postMessage({ok:true,result:VSTrace.traceImage(data.image,data.options)});}catch(e){self.postMessage({ok:false,error:e.message||'描摹失败'});}};`;
const preview=bundleModule(await read('src/trace-preview.js'),'VSPreview','const {pathData}=VSGeometry;');
const store=bundleModule(await read('src/project-store.js'),'VSStore');
const library=bundleModule(await read('src/project-library.js'),'VSLibrary','const {openProjectDB,projectRecords,putProject,removeProject}=VSStore;const {validateDocument,uid,exportSVG}=VSDocument;');
const ui=bundleModule(await read('src/editor-ui.js'),'VSUI','const {bounds,pathData}=VSGeometry;const {entries,members,expandSelection,rootId,selectedGroups}=VSGroups;');
const psd=bundleModule(await read('src/psd.js'),'VSPsd','const {bounds,pathData}=VSGeometry;const {entries}=VSGroups;');
let app=await read('src/app.js');
const imports={geometry:'VSGeometry',groups:'VSGroups',document:'VSDocument','trace-preview':'VSPreview','project-library':'VSLibrary','editor-ui':'VSUI',psd:'VSPsd'};
app=app.replace(/^import \* as (\w+) from '\.\/(.*?)\.js';$/gm,(_,name,file)=>`const ${name}=${imports[file]};`)
 .replace(/^import \{([^}]+)\} from '\.\/(.*?)\.js';$/gm,(_,names,file)=>`const {${names}}=${imports[file]};`)
 .replace("new Worker(new URL('./trace-worker.js',import.meta.url),{type:'module'})",'createLocalWorker()');
if(/\bimport\.meta|^import |=undefined;/m.test(app))throw new Error('An unbundled import remains.');
const bootstrap=`const workerSource=${JSON.stringify(worker)};\nfunction createLocalWorker(){const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));const instance=new Worker(url);setTimeout(()=>URL.revokeObjectURL(url),1000);return instance;}`;
const js=`(()=>{'use strict';\n${geometry}\n${groups}\n${documentModule}\n${preview}\n${store}\n${library}\n${ui}\n${psd}\n${bootstrap}\n${app}\n})();`;
const hash=createHash('sha256').update(js).digest('base64');
const css=await read('src/style.css')+'\n'+await read('src/workspace.css');
let html=await read('index.html');
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>${css}</style>`)
 .replace('<link rel="stylesheet" href="./src/workspace.css">','')
 .replace('<script type="module" src="./src/app.js"></script>',()=>`<script>${js}</script>`)
 .replace("script-src 'self'",`script-src 'sha256-${hash}'`).replace("worker-src 'self'",'worker-src blob:');
await mkdir(resolve(root,'dist'),{recursive:true});await writeFile(resolve(root,'dist/index.html'),html);await writeFile(resolve(root,'dist/.nojekyll'),'');
console.log(`Built dist/index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB). No external resources.`);
