import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const allowed=new Set(['index.html','styles.css','app.mjs','domain.mjs']);
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(path)){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(fileURLToPath(new URL(path,root)));res.writeHead(200,{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(500);res.end('Unable to read application file');}
}).listen(4173,'127.0.0.1',()=>console.log('CareRelay preview: http://127.0.0.1:4173'));
