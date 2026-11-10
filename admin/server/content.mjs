import {auditPage} from './seo-audit.mjs';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {guard,csrf,validMutation,databaseQuery} from './access.mjs';
import {LANGUAGES,hash,checks,validateFields,validateDocument,releaseSnapshot,translationState,validateTranslation} from './content-model.mjs';
import {translate} from './translator.mjs';
import {enqueue,workOne,budget} from './translation-jobs.mjs';
import {oauthReady,oauthStart,oauthCallback,searchReport,observeAI} from './search-services.mjs';
export const readSeed=async()=>JSON.parse(await readFile(new URL('./content-seed.json',import.meta.url),'utf8'));
export async function seedContent(query){
 for(const d of await readSeed()){
  const inserted=await query('INSERT INTO cms_documents(id,document) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING id',[d.id,JSON.stringify(d)]);
  if(inserted.length)continue;
  const r=(await query('SELECT version,document FROM cms_documents WHERE id=$1',[d.id]))[0];
  if(!r||r.document.baselineRevision===d.baselineRevision||!d.previousSourceHash)continue;
  // Upgrade only the untouched previous baseline. Archive it before changing the draft.
  if(hash(r.document.source)!==d.previousSourceHash)continue;
  await query(`WITH changed AS (UPDATE cms_documents SET document=$4::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *) , archived AS (INSERT INTO cms_revisions(document_id,version,document) SELECT id,$2,$3::jsonb FROM changed ON CONFLICT DO NOTHING) INSERT INTO cms_revisions(document_id,version,document) SELECT id,version,document FROM changed`,[d.id,r.version,JSON.stringify(r.document),JSON.stringify(d)]);
 }
}
export async function saveDoc(query,doc,version){validateDocument(doc);const rows=await query(`WITH changed AS (UPDATE cms_documents SET document=$3::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *) INSERT INTO cms_revisions(document_id,version,document) SELECT id,version,document FROM changed RETURNING version`,[doc.id,version,JSON.stringify(doc)]);if(!rows.length)throw Error('conflict');return rows[0].version;}
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const publicURL=(doc,lang)=>'https://tagai.art/'+lang+'/'+(doc.slug?doc.slug+'/':'');
async function reconcile(query,fetcher){const pending=await query("SELECT id FROM cms_releases WHERE status='pending'");if(!pending.length)return;try{const r=await fetcher('https://tagai.art/content-release.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return;const d=await r.json();if(d.releaseId===pending[0].id)await query("UPDATE cms_releases SET status='live',live_at=now(),error=NULL WHERE id=$1 AND status='pending'",[d.releaseId]);}catch{/* Keep pending: absence of confirmation is never success. */}}
export function createContentHandler({env=process.env,query=databaseQuery(env),fetcher=fetch,translator=translate}={}){return async(req,res)=>{
 if(!guard(req,res,env))return;
 const send=(n,d)=>res.status(n).json(d);
 try{
 if(req.method==='GET'&&new URL(req.url,'https://tagai-admin-vspa.vercel.app').pathname==='/api/search'&&new URL(req.url,'https://tagai-admin-vspa.vercel.app').searchParams.has('callback')){
 // OAuth return is cross-site top-level navigation; no mutation allowed without one-time state + bound cookie.
 await oauthCallback(req,query,env,fetcher);res.setHeader('Location','/content.html?connected=1');res.setHeader('Set-Cookie','__Host-tagai-oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');res.status(303).send('');return;
 }
 if(req.method==='GET'){
 await seedContent(query);await reconcile(query,fetcher);
 const documents=await query('SELECT id,version,document,updated_at FROM cms_documents ORDER BY id');
 const releases=await query('SELECT id,status,created_at,live_at,error FROM cms_releases ORDER BY created_at DESC LIMIT 15');
 const connected=(await query("SELECT name FROM cms_connections WHERE name='gsc'")).length>0;
 const reports=await query('SELECT id,kind,page_id,language,report,created_at FROM cms_reports ORDER BY created_at DESC LIMIT 30');
 const jobs=await query('SELECT id,document_id,language,status,error,created_at FROM cms_jobs ORDER BY created_at DESC LIMIT 30');
 return send(200,{csrf:csrf(req,res,env),documents:documents.map(r=>({...r,checks:checks(r.document)})),releases,jobs,reports,integrations:{translation:!!((env.OPENAI_API_KEY&&env.TRANSLATION_MODEL)||(env.TRANSLATION_FALLBACK_KEY&&env.TRANSLATION_FALLBACK_MODEL)),publication:!!env.CONTENT_DEPLOY_HOOK,googleOAuth:oauthReady(env),searchConsole:connected,aiMonitor:!!(env.OPENAI_API_KEY&&env.AI_MONITOR_MODEL),backgroundTranslation:!!env.CRON_SECRET}});
 }
 if(req.method!=='POST')return send(405,{error:'method'});
 if(!validMutation(req,env))return send(403,{error:'verification'});
 const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>220000)return send(413,{error:'too_large'});
 let b;try{b=JSON.parse(raw);}catch{return send(400,{error:'invalid'});}
 if(b.action==='oauth')return send(200,{url:await oauthStart(query,env,res)});
 if(b.action==='create'){
 const d={id:b.slug,slug:b.slug,kind:'article',indexable:true,enabled:false,schemaVersion:2,source:{title:b.title,description:b.description,heading:b.title,body:b.body},translations:{}};validateDocument(d);
 if(['site','home','app','visits','partners','updates','encounters','manage','api','assets','content-release','robots','sitemap'].includes(d.id))throw Error('slug');
 await query('INSERT INTO cms_documents(id,document) VALUES($1,$2::jsonb)',[d.id,JSON.stringify(d)]);await enqueue(query,d);return send(201,{id:d.id});
 }
 if(['publish','rollback','retry_release'].includes(b.action)){
 if(!env.CONTENT_DEPLOY_HOOK)throw Error('publish_not_configured');
 const hook=new URL(env.CONTENT_DEPLOY_HOOK);if(hook.origin!=='https://api.vercel.com'||!hook.pathname.startsWith('/v1/integrations/deploy/'))throw Error('publish_not_configured');
 if(!UUID.test(b.requestId||''))throw Error('invalid');
 let id=b.requestId;
 const existing=await query('SELECT id,status FROM cms_releases WHERE id=$1',[id]);
 if(!existing.length){
 let snapshot;
 if(b.action==='retry_release')throw Error('invalid');
 if(b.action==='rollback'){const previous=await query("SELECT snapshot FROM cms_releases WHERE id=$1 AND status='live'",[b.releaseId]);if(!previous.length)throw Error('invalid');snapshot=previous[0].snapshot;}
 else {const docs=await query('SELECT id,version,document FROM cms_documents ORDER BY id');if(JSON.stringify(Object.fromEntries(docs.map(r=>[r.id,r.version])))!==JSON.stringify(b.versions))throw Error('conflict');snapshot=releaseSnapshot(docs.map(r=>r.document));}
 await query('INSERT INTO cms_releases(id,snapshot) VALUES($1,$2::jsonb)',[id,JSON.stringify(snapshot)]);
 }else if(existing[0].status==='live')return send(200,{releaseId:id,status:'live'});
 try{const r=await fetcher(hook.href,{method:'POST',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();await query('UPDATE cms_releases SET error=NULL WHERE id=$1',[id]);}catch{await query("UPDATE cms_releases SET error='trigger_unconfirmed' WHERE id=$1",[id]);return send(202,{releaseId:id,status:'pending',warning:'trigger_unconfirmed'});}
 return send(202,{releaseId:id,status:'pending'});
 }
 const row=(await query('SELECT version,document FROM cms_documents WHERE id=$1',[b.id]))[0];if(!row)throw Error('not_found');const doc=row.document;
 if(['save','translate','override'].includes(b.action)&&row.version!==b.version)throw Error('conflict');
 if(b.action==='save'){
 validateFields(b.source,doc.source);doc.source=b.source;if(typeof b.enabled==='boolean'&&['article','updates'].includes(doc.kind)){if(b.enabled&&['updates','launch-update'].includes(doc.id)&&Date.now()<Date.parse('2026-12-01T00:00:00Z'))throw Error('scheduled_draft');doc.enabled=b.enabled;}if(typeof b.indexable==='boolean'&&doc.kind!=='manage'&&doc.kind!=='shared')doc.indexable=b.indexable;
 const version=await saveDoc(query,doc,b.version);await enqueue(query,doc);return send(200,{version});
 }
 if(b.action==='override'){
 if(!LANGUAGES.slice(1).includes(b.language))throw Error('invalid');validateTranslation(doc.source,b.fields);
 doc.translations[b.language]={fields:b.fields,sourceFields:doc.source,locked:Object.keys(b.fields),provider:'human',reviewed:true};return send(200,{version:await saveDoc(query,doc,b.version)});
 }
 if(b.action==='translate'){
 if(!LANGUAGES.slice(1).includes(b.language))throw Error('invalid');
 await enqueue(query,doc);return send(200,await workOne(query,env,fetcher,translator,{id:doc.id,language:b.language}));
 }
 if(b.action==='audit'){
 if(!LANGUAGES.includes(b.language)||doc.kind==='shared')throw Error('invalid');const report=await auditPage(publicURL(doc,b.language),fetcher);await query("INSERT INTO cms_reports(kind,page_id,language,report) VALUES('audit',$1,$2,$3::jsonb)",[b.id,b.language,JSON.stringify(report)]);return send(200,{report});
 }
 if(b.action==='search'){
 if(!LANGUAGES.includes(b.language)||doc.kind==='shared')throw Error('invalid');const report=await searchReport(query,env,publicURL(doc,b.language),fetcher);await query("INSERT INTO cms_reports(kind,page_id,language,report) VALUES('search',$1,$2,$3::jsonb)",[b.id,b.language,JSON.stringify(report)]);return send(200,{report});
 }
 if(b.action==='observe'){
 if(typeof b.prompt!=='string'||b.prompt.length<5||b.prompt.length>500||!LANGUAGES.includes(b.language))throw Error('invalid');
 if(!env.OPENAI_API_KEY||!env.AI_MONITOR_MODEL)throw Error('monitor_not_configured');
 // Reserve a slot before provider call, including failures, to bound spend.
 await budget(query,'ai',10);
 const slots=await query(`INSERT INTO cms_reports(kind,page_id,language,report) SELECT 'ai',$1,$2,$3::jsonb WHERE (SELECT count(*) FROM cms_reports WHERE kind='ai' AND created_at>now()-interval '1 day')<10 RETURNING id`,[b.id,b.language,JSON.stringify({status:'running',prompt:b.prompt})]);if(!slots.length)throw Error('daily_limit');
 try{const report=await observeAI(b.prompt,env,fetcher);await query('UPDATE cms_reports SET report=$2::jsonb WHERE id=$1',[slots[0].id,JSON.stringify({...report,status:'done'})]);return send(200,{report});}catch(e){await query('UPDATE cms_reports SET report=$2::jsonb WHERE id=$1',[slots[0].id,JSON.stringify({status:'failed',prompt:b.prompt,error:'monitor_failed'})]);throw e;}
 }
 throw Error('invalid');
 }catch(e){const allowed=['scheduled_draft','conflict','fields','invalid','not_found','slug','not_ready','translation_not_configured','translation_failed','translation_literals','locked_translation','daily_limit','publish_not_configured','oauth_not_configured','oauth_state','oauth_failed','gsc_not_connected','gsc_reconnect','gsc_property','gsc_access','monitor_not_configured','monitor_failed'];const code=e.code==='23505'?'conflict':allowed.includes(e.message)?e.message:'service_unavailable';return send(code==='conflict'?409:code==='service_unavailable'?503:400,{error:code});}
};}
