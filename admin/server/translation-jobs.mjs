import {randomUUID} from 'node:crypto';
import {hash,LANGUAGES,translationState,validateTranslation,validateDocument} from './content-model.mjs';
import {translate} from './translator.mjs';
export async function enqueue(query,doc){for(const language of LANGUAGES.slice(1))if(translationState(doc,language)!=='ready')await query(`INSERT INTO cms_jobs(id,document_id,language,source_hash,status) VALUES($1,$2,$3,$4,'queued') ON CONFLICT DO NOTHING`,[randomUUID(),doc.id,language,hash(doc.source)]);}
export async function budget(query,kind,limit){const rows=await query(`INSERT INTO cms_budgets(day,kind,used) VALUES(CURRENT_DATE,$1,1) ON CONFLICT(day,kind) DO UPDATE SET used=cms_budgets.used+1 WHERE cms_budgets.used<$2 RETURNING used`,[kind,limit]);if(!rows.length)throw Error('daily_limit');}
export async function workOne(query,env,fetcher=fetch,translator=translate,filter={}){
 if(!((env.OPENAI_API_KEY&&env.TRANSLATION_MODEL)||(env.TRANSLATION_FALLBACK_KEY&&env.TRANSLATION_FALLBACK_MODEL)))throw Error('translation_not_configured');
 await query("UPDATE cms_jobs SET status='failed',error='timeout' WHERE status='running' AND created_at < now()-interval '4 minutes'");
 const jobs=await query(`UPDATE cms_jobs SET status='running',created_at=now() WHERE id=(SELECT id FROM cms_jobs WHERE status='queued' AND ($1::text IS NULL OR document_id=$1) AND ($2::text IS NULL OR language=$2) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[filter.id||null,filter.language||null]);
 if(!jobs.length)return {empty:true};const job=jobs[0];
 try{
 const row=(await query('SELECT version,document FROM cms_documents WHERE id=$1',[job.document_id]))[0];if(!row)throw Error('not_found');const doc=row.document,old=doc.translations[job.language];
 if(translationState(doc,job.language)==='ready'){await query("UPDATE cms_jobs SET status='done',finished_at=now() WHERE id=$1",[job.id]);return {unchanged:true};}
 const changed=Object.fromEntries(Object.entries(doc.source).filter(([k,v])=>!old||old.sourceFields?.[k]!==v));if(old?.locked?.some(k=>k in changed))throw Error('locked_translation');
 await budget(query,'translation',50);
 const result=await translator(changed,job.language,doc.source,env,fetcher);
 const latest=(await query('SELECT version,document FROM cms_documents WHERE id=$1',[doc.id]))[0];if(hash(latest.document.source)!==hash(doc.source))throw Error('conflict');
 // Do not overwrite a manual correction made while the model was running.
 if(JSON.stringify(latest.document.translations[job.language])!==JSON.stringify(old))throw Error('conflict');
 const fields={...old?.fields,...result.fields};validateTranslation(doc.source,fields);
 latest.document.translations[job.language]={fields,sourceFields:doc.source,locked:old?.locked||[],provider:result.provider,reviewed:false};validateDocument(latest.document);
 const saved=await query(`WITH changed AS (UPDATE cms_documents SET document=$3::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *) INSERT INTO cms_revisions(document_id,version,document) SELECT id,version,document FROM changed RETURNING version`,[doc.id,latest.version,JSON.stringify(latest.document)]);if(!saved.length)throw Error('conflict');
 await query("UPDATE cms_jobs SET status='done',finished_at=now() WHERE id=$1",[job.id]);return {translated:true};
 }catch(e){await query("UPDATE cms_jobs SET status='failed',error=$2,finished_at=now() WHERE id=$1",[job.id,['conflict','locked_translation','daily_limit'].includes(e.message)?e.message:'translation_failed']);throw e;}
}
