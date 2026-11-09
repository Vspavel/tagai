import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { schema } from '../server/schema.mjs';
import { createHandler } from '../server/waitlist.mjs';
import { challenge, verifyChallenge, normalizeEmail, CONSENT_VERSION } from '../server/security.mjs';
let pg;
const env={DATABASE_URL:'test',FORM_SECRET:'test-secret-with-at-least-thirty-two-characters',VERCEL:'1',VERCEL_URL:'tagai-test.vercel.app'};
const now=Date.now();let n=0;
before(async()=>{pg=new PGlite();for(const s of schema)await pg.exec(s);});
after(async()=>pg.close());
const db=()=>({query:async(s,p)=>(await pg.query(s,p)).rows});
async function call(body={},options={}){
  const ip=options.ip||`test-${++n}`;
  const req={method:options.method||'POST',headers:{origin:'https://tagai.art','content-type':'application/json','x-vercel-forwarded-for':ip,...options.headers},body:{email:'reader@example.com',city:'Cyprus',language:'en',consent:true,token:challenge(ip,env.FORM_SECRET,now),...body}};
  const result={headers:{}};
  const res={setHeader(k,v){result.headers[k]=v;},status(s){result.status=s;return this;},json(v){result.body=v;return result;}};
  await createHandler({db:options.db||db,env:options.env||env,clock:()=>now})(req,res);
  return result;
}
test('stores a real PostgreSQL row with normalized email and server consent',async()=>{
  const r=await call({email:' Reader@Example.com ',source:'gallery'});assert.equal(r.status,200);
  const {rows}=await pg.query('SELECT * FROM waitlist_signups WHERE email=$1',['reader@example.com']);
  assert.equal(rows.length,1);assert.equal(rows[0].consent_version,CONSENT_VERSION);assert.equal(rows[0].email_verified,false);assert.equal(rows[0].source,'gallery');assert.ok(rows[0].consent_at);assert.ok(rows[0].expires_at>rows[0].created_at);
});
test('duplicate cannot overwrite original language, city, source or consent date',async()=>{
  const original=(await pg.query('SELECT * FROM waitlist_signups WHERE email=$1',['reader@example.com'])).rows[0];
  const results=await Promise.all(Array.from({length:5},()=>call({email:'READER@example.com',city:'Paris',language:'fr'})));
  for(const r of results)assert.deepEqual(r.body,{accepted:true});
  const rows=(await pg.query('SELECT * FROM waitlist_signups WHERE email=$1',['reader@example.com'])).rows;
  assert.equal(rows.length,1);assert.deepEqual(rows[0],original);
});
test('rejects invalid consent, language, city, emails, honeypot and forged token before DB',async()=>{
  const never=()=>{throw new Error('Database should not be reached');};
  for(const body of [{consent:false},{consent:'true'},{language:'ru'},{city:'<script>'},{email:'x@y'},{email:'a@b@c.com'},{website:'spam'},{token:'forged'}]) assert.equal((await call(body,{db:never})).status,400);
});
test('strict same-origin, JSON, method and body limits',async()=>{
  assert.equal((await call({}, {headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await call({}, {headers:{origin:undefined}})).status,403);
  assert.equal((await call({}, {headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await call({}, {headers:{'content-length':'4097'}})).status,413);
  assert.equal((await call({source:'a'.repeat(4100)})).status,400);
  assert.equal((await call({}, {method:'DELETE'})).status,405);
});
test('challenge is address-bound, expires, rejects future timestamps and tampering',()=>{
  const token=challenge('ip',env.FORM_SECRET,now);
  assert.equal(verifyChallenge(token,'ip',env.FORM_SECRET,now+100),true);
  assert.equal(verifyChallenge(token,'other',env.FORM_SECRET,now+100),false);
  assert.equal(verifyChallenge(token,'ip',env.FORM_SECRET,now+1800001),false);
  assert.equal(verifyChallenge(token,'ip',env.FORM_SECRET,now-1),false);
});
test('database enforces 20 requests per hour and never stores overflow',async()=>{
  const results=await Promise.all(Array.from({length:23},(_,i)=>call({email:`limit-${i}@example.com`},{ip:'shared-network'})));
  assert.equal(results.filter(r=>r.status===200).length,20);assert.equal(results.filter(r=>r.status===429).length,3);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM waitlist_signups WHERE email LIKE 'limit-%'" )).rows[0].n,20);
  assert.ok(results.find(r=>r.status===429).headers['Retry-After']);
});
test('storage failure returns unavailable, never accepted',async()=>{
  const r=await call({}, {db:()=>({query:async()=>{throw new Error('offline');}})});
  assert.equal(r.status,503);assert.equal(r.body.accepted,undefined);
  assert.equal((await call({}, {env:{}})).status,503);
});
test('privacy requests persist separately and do not silently erase an unverified address',async()=>{
  const r=await call({kind:'privacy',requestType:'delete',message:'Please remove my signup',language:'fr'});assert.equal(r.status,200);
  const rows=(await pg.query('SELECT * FROM privacy_requests')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM waitlist_signups WHERE email='reader@example.com'")).rows[0].n,1);
});
test('retention SQL removes only expired rows and can run repeatedly',async()=>{
  await pg.query("UPDATE waitlist_signups SET expires_at=now()-interval '1 day' WHERE email='limit-0@example.com'");
  await pg.query('DELETE FROM waitlist_signups WHERE expires_at < now()');
  await pg.query('DELETE FROM waitlist_signups WHERE expires_at < now()');
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM waitlist_signups WHERE email='reader@example.com'")).rows[0].n,1);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM waitlist_signups WHERE email='limit-0@example.com'")).rows[0].n,0);
});
test('normalizes valid international domains and rejects malformed local parts',()=>{
  assert.equal(normalizeEmail('A+art@EXAMPLE.COM'),'a+art@example.com');
  for(const input of ['.a@example.com','a..b@example.com','a@-bad.com','a\n@example.com'])assert.equal(normalizeEmail(input),null);
});
