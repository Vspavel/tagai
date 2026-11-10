import {createRegistrationHandler} from '../server/registrations.mjs';
import {createEnquiryHandler} from '../admin/server/enquiries.mjs';
import {contentSchema} from '../admin/server/content-schema.mjs';
import {createContentHandler} from '../admin/server/content.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../server/waitlist.mjs';
import { schema } from '../server/schema.mjs';
import { createAdminHandler } from '../admin/server/data.mjs';
import { createPrivacyHandler } from '../admin/server/privacy.mjs';
const portArg=process.argv.indexOf('--port');
const port=portArg>=0?Number(process.argv[portArg+1]):4174;
const pg=new PGlite();
for(const sql of [...schema,...contentSchema])await pg.exec(sql);
const handler=createHandler({db:()=>({query:async(s,p)=>(await pg.query(s,p)).rows}),env:{DEV_PORT:port,DATABASE_URL:'local-test',FORM_SECRET:'local-development-secret-not-for-production'}});
const env={ADMIN_ENABLED:'1',ADMIN_PROJECT_ID:'local',VERCEL_PROJECT_ID:'local',VERCEL_ENV:'production',DATABASE_URL:'local',LOCAL_ADMIN_TEST:'1',DEV_PORT:port};
const query=async(s,p)=>(await pg.query(s,p)).rows;
const admin=createAdminHandler({env,query}),privacy=createPrivacyHandler({env,query});
const content=createContentHandler({env,query});
const registrations=createRegistrationHandler({env:{DEV_PORT:port,DATABASE_URL:'local',FORM_SECRET:'local-development-secret-not-for-production'},query});const enquiries=createEnquiryHandler({env,query});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain'};
createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(['/api/waitlist','/api/registrations','/api/enquiries','/api/data','/api/privacy','/api/content','/api/search'].includes(path)){
      const chunks=[];for await(const c of req){chunks.push(c);if(Buffer.concat(chunks).length>220000){res.writeHead(413).end();return;}}
      req.body=Buffer.concat(chunks).toString();res.status=n=>{res.statusCode=n;return res;};res.json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
      res.send=x=>res.end(x);
      return await (path==='/api/registrations'?registrations:path==='/api/enquiries'?enquiries:path==='/api/waitlist'?handler:path==='/api/data'?admin:path==='/api/privacy'?privacy:content)(req,res);
    }
    if(path==='/qa/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>TAGAI local responsive QA</title><style>body{font:16px system-ui;margin:20px}iframe{width:390px;height:844px;border:1px solid #777;display:inline-block;vertical-align:top;margin:12px}a{padding:12px}nav{margin-bottom:10px}</style></head><body><nav><a href="/en/">Website</a><a href="/en/visits/">Visits</a><a href="/en/manage/">Manage</a><a href="/admin/">Admin</a></nav><iframe title="Mobile app page" src="/en/#collection"></iframe><iframe title="Mobile visits page" src="/fr/visits/#enquiry"></iframe><iframe title="Mobile management page" src="/el/manage/"></iframe></body></html>');return;}
    if(path==='/admin/'||['/admin.js','/admin.css','/content.html','/content.js','/content.css'].includes(path)){const f=path==='/admin/'?'index.html':path.slice(1);res.setHeader('Content-Type',types[extname(f)]);res.end(await readFile(resolve('admin/public',f)));return;}
    let file=resolve('dist','.'+decodeURIComponent(path));
    if(file!==resolve('dist')&&!file.startsWith(resolve('dist')+'/'))throw Error();
    if((await stat(file)).isDirectory())file+='/index.html';
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log(`Development server: http://localhost:${port} (ephemeral test database)`));
