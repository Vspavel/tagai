import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {schema} from '../server/schema.mjs';import {createRegistrationHandler} from '../server/registrations.mjs';import {createEnquiryHandler} from '../admin/server/enquiries.mjs';
const env={DATABASE_URL:'local',FORM_SECRET:'test-form-secret-abcdefghijklmnopqrstuvwxyz',DEV_PORT:4174};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.body=d;return this}});
async function setup(fn){const db=new PGlite();try{for(const s of schema)await db.exec(s);const query=async(s,p)=>(await db.query(s,p)).rows;await fn(query);}finally{await db.close();}}
async function client(query,extra={},fetcher){const h=createRegistrationHandler({env:{...env,...extra},query,fetcher});let r=response();await h({method:'GET',headers:{}},r);const token=r.body.token;return async(body,origin='http://localhost:4174')=>{const res=response();await h({method:'POST',headers:{origin,'content-type':'application/json'},body:{token,language:'en',website:'',...body}},res);return res;};}
const subscription=(extra={})=>({action:'subscription',requestId:crypto.randomUUID(),email:'person@example.com',selections:['app'],cities:[],...extra});
test('new subscriptions persist without promising email and retries stay independent',()=>setup(async q=>{const post=await client(q),b=subscription({selections:['app','updates']});for(let i=0;i<2;i++){const r=await post(b);assert.equal(r.code,200);assert.equal(r.body.emailStatus,'not_configured');assert.equal(r.body.accessToken,undefined);}assert.equal((await q('SELECT * FROM subscription_requests')).length,1);assert.equal((await q('SELECT * FROM waitlist_signups'))[0].email_verified,false);assert.equal((await q('SELECT * FROM update_signups')).length,1);assert.equal((await q('SELECT * FROM visit_signups')).length,0);const conflict=await post({...b,email:'other@example.com'});assert.equal(conflict.code,409);assert.equal((await post({...b,action:'access'})).code,503);assert.equal((await post(b,'https://evil.example')).code,403);}));
test('confirmation verifies only selected lists; replay cannot undo unsubscribe; tokens expire',()=>setup(async q=>{let emailBody;const post=await client(q,{RESEND_API_KEY:'test',EMAIL_FROM:'TAGAI <mail@tagai.art>',EMAIL_DELIVERY_ENABLED:'1'},async(url,opts)=>{emailBody=JSON.parse(opts.body);return Response.json({id:'sent'});});const b=subscription({selections:['app','visits'],cities:['Paris']});assert.equal((await post(b)).body.emailStatus,'sent');const accessToken=emailBody.text.match(/#token=([\w-]{43})/)[1];let r=await post({action:'inspect',accessToken});assert.equal(r.body.needsConfirmation,true);assert.equal(r.body.email,undefined);r=await post({action:'preferences',accessToken,preferences:{app:false,visits:false,updates:false}});assert.equal(r.code,403);r=await post({action:'confirm',accessToken});assert.equal(r.code,200);assert.equal(r.body.alreadyConfirmed,false);assert.deepEqual(r.body.preferences,{app:true,updates:false,visits:true});assert.deepEqual((await q('SELECT visit_cities FROM subscriber_profiles'))[0].visit_cities,['Paris']);r=await post({action:'preferences',accessToken,preferences:{app:false,updates:false,visits:true}});assert.equal(r.body.preferences.app,false);r=await post({action:'confirm',accessToken});assert.equal(r.body.preferences.app,false);assert.equal(r.body.alreadyConfirmed,true);await q("UPDATE subscription_requests SET expires_at=now()-interval '1 second'");assert.equal((await post({action:'inspect',accessToken})).body.error,'expired');}));
test('provider failures preserve requests for retry and never verify ownership',()=>setup(async q=>{const post=await client(q,{RESEND_API_KEY:'test',EMAIL_FROM:'mail@tagai.art',EMAIL_DELIVERY_ENABLED:'1'},async()=>{throw Error('timeout')});const r=await post(subscription());assert.equal(r.code,200);assert.equal(r.body.emailStatus,'failed');assert.equal((await q('SELECT email_verified FROM waitlist_signups'))[0].email_verified,false);}));
test('enquiries deduplicate JSONB key order, reject changed retries and never subscribe',()=>setup(async q=>{const post=await client(q),b={action:'enquiry',requestId:crypto.randomUUID(),email:'gallery@example.com',kind:'visit',details:{organisation:'A gallery',role:'gallery',city:'Other',otherCity:'Athens',message:'Proposal'}};assert.equal((await post(b)).code,200);assert.equal((await post(b)).code,200);assert.equal((await q('SELECT * FROM enquiries')).length,1);assert.equal((await q('SELECT * FROM waitlist_signups')).length,0);assert.equal((await post({...b,details:{...b.details,message:'Changed'}})).code,409);assert.equal((await post({...b,requestId:crypto.randomUUID(),details:{...b.details,url:'javascript:alert(1)'}})).code,400);
 const adminEnv={ADMIN_ENABLED:'1',ADMIN_PROJECT_ID:'local',VERCEL_PROJECT_ID:'local',VERCEL_ENV:'production',DATABASE_URL:'test',LOCAL_ADMIN_TEST:'1',DEV_PORT:4174};const h=createEnquiryHandler({env:adminEnv,query:q});let r=response();await h({method:'GET',url:'/api/enquiries?kind=visit',headers:{}},r);assert.equal(r.body.total,1);const token=r.body.token,headers={origin:'http://localhost:4174','content-type':'application/json','x-csrf-token':token,cookie:'tagai-admin-csrf-local='+token};for(let i=0;i<2;i++){r=response();await h({method:'POST',headers,body:{id:b.requestId,version:1,status:'in_progress'}},r);assert.equal(r.code,200);}r=response();await h({method:'POST',headers,body:{id:b.requestId,version:1,status:'closed'}},r);assert.equal(r.code,409);
}));

test('unique email creation and confirmation transitions survive concurrent requests and retries',()=>setup(async q=>{
 const sent=[];const post=await client(q,{RESEND_API_KEY:'test',EMAIL_FROM:'mail@tagai.art',EMAIL_DELIVERY_ENABLED:'1'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({id:'sent'});});
 const first=subscription({email:' Person@Example.com ',attribution:{first:{source:'instagram',medium:'social',campaign:'launch'},last:{source:'instagram',medium:'social',campaign:'launch'}}});
 const results=await Promise.all([post(first),post({...first,requestId:crypto.randomUUID(),email:'person@example.com'})]);
 assert.equal(results.flatMap(r=>r.body.createdAudiences).filter(x=>x==='app').length,1);
 assert.equal((await q('SELECT * FROM waitlist_signups')).length,1);
 assert.deepEqual((await post(first)).body.createdAudiences,[]);
 const token=sent[0].text.match(/#token=([\w-]{43})/)[1];
 const confirmed=await Promise.all([post({action:'confirm',accessToken:token}),post({action:'confirm',accessToken:token})]);
 assert.equal(confirmed.flatMap(r=>r.body.activated).filter(x=>x.audience==='app'&&x.firstTime).length,1);
 assert.equal((await q('SELECT activation_count FROM waitlist_signups'))[0].activation_count,1);
 const later=subscription({attribution:{first:{source:'new'},last:{source:'gallery',medium:'referral',campaign:'visit'}}});
 assert.deepEqual((await post(later)).body.createdAudiences,[]);
 const latestToken=sent.at(-1).text.match(/#token=([\w-]{43})/)[1];assert.deepEqual((await post({action:'confirm',accessToken:latestToken})).body.activated,[]);
 const saved=(await q('SELECT * FROM waitlist_signups'))[0];assert.equal(saved.source,'instagram');assert.equal(saved.campaign,'launch');assert.equal(saved.attribution.last.source,'gallery');
 await post({action:'preferences',accessToken:token,preferences:{app:false,visits:false,updates:false}});
 assert.deepEqual((await post({action:'confirm',accessToken:token})).body.activated,[]);
 const enabled=await post({action:'preferences',accessToken:token,preferences:{app:true,visits:false,updates:false}});assert.equal(enabled.body.activated[0].firstTime,false);assert.equal(enabled.body.activated[0].audience,'app');
 assert.deepEqual((await post({action:'preferences',accessToken:token,preferences:{app:true,visits:false,updates:false}})).body.activated,[]);
}));

test('joining app from verified update preferences preserves acquisition and migrations are repeatable',()=>setup(async q=>{
 let mail;const post=await client(q,{RESEND_API_KEY:'test',EMAIL_FROM:'mail@tagai.art',EMAIL_DELIVERY_ENABLED:'1'},async(_url,opts)=>{mail=JSON.parse(opts.body);return Response.json({id:'sent'});});
 await post(subscription({selections:['updates'],attribution:{first:{source:'instagram',medium:'social',campaign:'story'}}}));
 const accessToken=mail.text.match(/#token=([\w-]{43})/)[1];await post({action:'confirm',accessToken});
 const r=await post({action:'preferences',accessToken,preferences:{app:true,updates:true,visits:false}});
 assert.deepEqual(r.body.activated.map(x=>[x.audience,x.firstTime]),[['app',true]]);
 assert.equal(r.body.activated[0].attribution.first.source,'instagram');
 for(const sql of schema)await q(sql);
 assert.equal((await q('SELECT activation_count,source FROM waitlist_signups'))[0].activation_count,1);
 assert.equal((await q('SELECT source FROM waitlist_signups'))[0].source,'instagram');
}));
