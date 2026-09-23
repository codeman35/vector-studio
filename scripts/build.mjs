/** Tiny, dependency-free bundler for this project's fixed ES-module graph.
 * Keep source modules maintainable; publish one self-contained HTML.
 * No eval / new Function. The inline script is allowlisted with a CSP hash.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(resolve(root,p),'utf8');
function bundleModule(source,name,bindings=''){
  const exports=[...source.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_]\w*)/g)].map(m=>m[1]);
  const body=source.replace(/^import .*?;\s*$/mg,'').replace(/\bexport\s+(?=(?:const|let|function|class)\b)/g,'');
  return `const ${name} = (() => {\n${bindings}\n${body}\nreturn {${exports.join(',')}};\n})();`;
}
const geometry=bundleModule(await read('src/geometry.js'),'VSGeometry');
const documentModule=bundleModule(await read('src/document.js'),'VSDocument','const {node,ring,pathData}=VSGeometry;');
const trace=bundleModule(await read('src/trace.js'),'VSTrace','const {stitchEdges,signedArea,simplifyRing,groupRings,ring}=VSGeometry;');
const worker=`${geometry}\n${trace}\nself.onmessage=({data})=>{try{self.postMessage({ok:true,result:VSTrace.traceImage(data.image,data.options)});}catch(e){self.postMessage({ok:false,error:e.message||'描摹失败'});}};`;
let app=(await read('src/app.js')).replace("import * as G from './geometry.js';","const G=VSGeometry;").replace(/import \{([^}]+)\} from '.\/document.js';/, 'const {$1}=VSDocument;');
app=app.replace("new Worker(new URL('./trace-worker.js',import.meta.url),{type:'module'})", "createLocalWorker()");
if(/\bimport\.meta|^import /m.test(app))throw new Error('An unbundled import remains.');
const bootstrap=`const workerSource=${JSON.stringify(worker)};\nfunction createLocalWorker(){const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));const instance=new Worker(url);setTimeout(()=>URL.revokeObjectURL(url),1000);return instance;}`;
const js=`(()=>{'use strict';\n${geometry}\n${documentModule}\n${bootstrap}\n${app}\n})();`;
const hash=createHash('sha256').update(js).digest('base64');
const css=await read('src/style.css');
let html=await read('index.html');
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>${css}</style>`)
 .replace('<script type="module" src="./src/app.js"></script>',()=>`<script>${js}</script>`)
 .replace("script-src 'self'",`script-src 'sha256-${hash}'`).replace("worker-src 'self'","worker-src blob:");
await mkdir(resolve(root,'dist'),{recursive:true});
await writeFile(resolve(root,'dist/index.html'),html);
await writeFile(resolve(root,'dist/.nojekyll'),'');
console.log(`Built dist/index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB). No external resources.`);
