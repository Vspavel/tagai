import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {schema} from '../server/schema.mjs';import {createRegistrationHandler} from '../server/registrations.mjs';
const seed=JSON.parse(await readFile(new URL('../admin/server/content-seed.json',import.meta.url),'utf8'));
test('November copy preserves chronology, seven matching languages, and illustrative arithmetic',()=>{
 for(const lang of ['en','fr','el','es','it','de','ru']){
 const fields=id=>{const d=seed.find(d=>d.id===id);return lang==='en'?d.source:d.translations[lang].fields;};
 const h=fields('home'),p=fields('partners'),s=fields('sarah-awad');assert.ok(h.appDescription);assert.ok(!h.launch.endsWith('.'));assert.ok(h['encounter.dialogue.2.text']);
 for(const [i,n,t,share]of [[0,40,120,50],[1,30,72,30],[2,20,48,20]]){assert.equal(p[`report.example.rows.${i}.1`],String(n));assert.equal(parseInt(p[`report.example.rows.${i}.2`]),t);assert.equal(p[`report.example.rows.${i}.3`],share+'%');}
 assert.match(s.body,/\*\*TAGAI\*\*/);assert.ok(s.interpretationNote);assert.equal((s.sources.match(/https:\/\//g)||[]).length,2);
 }
 assert.equal(seed.find(d=>d.id==='home').translations.ru.fields['faqs.2.question'],'Нужно ли покупать произведения или разбираться в искусстве?');
});
test('all affected form categories reject invalid email, persist and deduplicate independently, and fail closed on storage errors',async()=>{
 const db=new PGlite();try{for(const sql of schema)await db.exec(sql);const query=async(s,p)=>(await db.query(s,p)).rows;
 const env={DATABASE_URL:'local',FORM_SECRET:'test-form-secret-abcdefghijklmnopqrstuvwxyz',DEV_PORT:4174};
 const response=()=>({setHeader(){},status(n){this.code=n;return this},json(d){this.body=d;return this}});
 const h=createRegistrationHandler({env,query});let ready=response();await h({method:'GET',headers:{}},ready);
 const bodies=[{action:'subscription',selections:['app','updates'],cities:[]},{action:'subscription',selections:['visits'],cities:['Paris']},{action:'enquiry',kind:'visit',details:{organisation:'QA artist',role:'artist',city:'Paris'}},{action:'enquiry',kind:'pilot',details:{organisation:'QA institution'}}];
 for(const [i,data]of bodies.entries()){
 const body={...data,requestId:crypto.randomUUID(),email:`qa${i}@example.com`,language:'en',website:'',token:ready.body.token};
 const req=b=>({method:'POST',headers:{origin:'http://localhost:4174','content-type':'application/json'},body:b});
 let r=response();await h(req({...body,email:'broken'}),r);assert.equal(r.code,400);
 for(let j=0;j<2;j++){r=response();await h(req(body),r);assert.equal(r.code,200);assert.equal(r.body.accepted,true);}
 const fail=createRegistrationHandler({env,query:async()=>{throw Error('test storage outage');}});r=response();await fail(req({...body,requestId:crypto.randomUUID()}),r);assert.notEqual(r.code,200);assert.notEqual(r.body.accepted,true);
 }
 for(const table of ['waitlist_signups','update_signups','visit_signups'])assert.equal((await query('SELECT * FROM '+table)).length,1);
 const rows=await query('SELECT kind FROM enquiries ORDER BY kind');assert.deepEqual(rows.map(r=>r.kind),['pilot','visit']);
 }finally{await db.close();}
});
