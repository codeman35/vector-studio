// Local development only. Production is static hosting (GitHub Pages).
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.PORT||5173),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}const info=await stat(file);if(!info.isFile())throw new Error('Not a file');res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Vector Studio: http://127.0.0.1:${port}`));
