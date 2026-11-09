import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {schema} from '../server/schema.mjs';
import {createPrivacyHandler} from '../admin/server/privacy.mjs';
const env={ADMIN_ENABLED:'1',ADMIN_PROJECT_ID:'private-admin',VERCEL_PROJECT_ID:'private-admin',VERCEL_ENV:'production',DATABASE_URL:'test'};
const token='a'.repeat(64),headers={origin:'https://tagai-admin-vspa.vercel.app','content-type':'application/json',cookie:'__Host-tagai-admin-csrf='+token,'x-csrf-token':token};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
async function setup(){const db=new PGlite();for(const s of schema)await db.exec(s);for(const s of schema)await db.exec(s);return db;}
async function seed(db,type='withdraw',audience='app'){const id=crypto.randomUUID();for(const table of ['waitlist_signups','visit_signups'])await db.query(`INSERT INTO ${table}(id,email,language,consent_version) VALUES ($1,$2,'en','test') ON CONFLICT(email) DO NOTHING`,[crypto.randomUUID(),'test@example.com']);await db.query('INSERT INTO privacy_requests(id,email,language,request_type,audience) VALUES ($1,$2,$3,$4,$5)',[id,'test@example.com','en',type,audience]);return id;}
async function call(db,body,extra={}){const res=response();await createPrivacyHandler({env,query:async(s,p)=>(await db.query(s,p)).rows})({method:'POST',url:'/',headers,body,...extra},res);return res;}
test('privacy writes require protected project, same origin, CSRF and verified ownership',async()=>{
const db=await setup();try{const id=await seed(db),body={id,version:1,operationId:crypto.randomUUID(),action:'withdraw',ownerVerified:true,note:'Verified by a private reply'};
for(const h of [{...headers,origin:'https://evil.example'},{...headers,'x-csrf-token':'wrong'},{...headers,cookie:''}])assert.equal((await call(db,body,{headers:h})).code,403);
assert.equal((await call(db,{...body,ownerVerified:false})).code,400);
assert.equal((await db.query('SELECT status FROM waitlist_signups')).rows[0].status,'active');
const res=response();await createPrivacyHandler({env:{...env,VERCEL_PROJECT_ID:'public'},query:()=>{throw Error('must not run');}})({method:'POST',headers,body},res);assert.equal(res.code,503);
}finally{await db.close();}});
test('withdrawal is atomic, scoped to the requested list, idempotent and version guarded',async()=>{
const db=await setup();try{const id=await seed(db);let r=await call(db,{id,version:1,operationId:crypto.randomUUID(),action:'start',ownerVerified:false,note:'Checking address ownership'});assert.equal(r.code,200);
const body={id,version:2,operationId:crypto.randomUUID(),action:'withdraw',ownerVerified:true,note:'Owner confirmed from their address'};
r=await call(db,{...body,version:1});assert.equal(r.code,409);r=await call(db,body);assert.equal(r.code,200);assert.equal((await call(db,body)).code,200);
assert.equal((await db.query('SELECT status FROM waitlist_signups')).rows[0].status,'withdrawn');assert.equal((await db.query('SELECT status FROM visit_signups')).rows[0].status,'active');
assert.equal((await db.query('SELECT status FROM privacy_requests WHERE id=$1',[id])).rows[0].status,'resolved');assert.equal((await db.query('SELECT count(*)::int AS n FROM privacy_actions')).rows[0].n,2);
}finally{await db.close();}});
test('deletion only removes the requested audience and cannot masquerade as another request type',async()=>{
const db=await setup();try{const id=await seed(db,'delete','visits'),body={id,version:1,operationId:crypto.randomUUID(),action:'delete',ownerVerified:true,note:'Owner requested deletion of visits signup'};
assert.equal((await call(db,{...body,action:'complete'})).code,409);assert.equal((await call(db,body)).code,200);
assert.equal((await db.query('SELECT count(*)::int AS n FROM visit_signups')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM waitlist_signups')).rows[0].n,1);
}finally{await db.close();}});
test('both-list withdrawal and pending queue pagination preserve all requests',async()=>{
const db=await setup();try{const id=await seed(db,'withdraw','both');for(let i=0;i<51;i++)await db.query("INSERT INTO privacy_requests(id,email,language,request_type) VALUES ($1,$2,'en','other')",[crypto.randomUUID(),`qa-${i}@example.com`]);
const r=await call(db,null,{method:'GET',url:'/?status=open&page=1'});assert.equal(r.code,200);assert.equal(r.body.rows.length,50);assert.equal(r.body.pending,52);assert.equal(r.body.hasNext,true);assert.match(r.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
assert.equal((await call(db,{id,version:1,operationId:crypto.randomUUID(),action:'withdraw',ownerVerified:true,note:'Verified for both lists'})).code,200);
for(const table of ['waitlist_signups','visit_signups'])assert.equal((await db.query(`SELECT status FROM ${table}`)).rows[0].status,'withdrawn');
}finally{await db.close();}});
