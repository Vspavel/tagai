import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../server/waitlist.mjs';
import { schema } from '../server/schema.mjs';
const pg=new PGlite();
for(const sql of schema)await pg.exec(sql);
const handler=createHandler({db:()=>({query:async(s,p)=>(await pg.query(s,p)).rows}),env:{DATABASE_URL:'local-test',FORM_SECRET:'local-development-secret-not-for-production'}});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain'};
createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/waitlist'){
      const chunks=[];for await(const c of req){chunks.push(c);if(Buffer.concat(chunks).length>4096){res.writeHead(413).end();return;}}
      req.body=Buffer.concat(chunks).toString();res.status=n=>{res.statusCode=n;return res;};res.json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
      return await handler(req,res);
    }
    let file=resolve('dist','.'+decodeURIComponent(path));
    if(!file.startsWith(resolve('dist')+'/'))throw Error();
    if((await stat(file)).isDirectory())file+='/index.html';
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end('Not found');}
}).listen(4174,'0.0.0.0',()=>console.log('Development server: http://localhost:4174 (ephemeral test database)'));
