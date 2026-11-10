import {timingSafeEqual} from 'node:crypto';
import {databaseQuery} from '../server/access.mjs';
import {workOne} from '../server/translation-jobs.mjs';
export default async function(req,res){res.setHeader('Cache-Control','no-store');const env=process.env,a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+(env.CRON_SECRET||''));if(req.method!=='GET'||!env.CRON_SECRET||a.length!==b.length||!timingSafeEqual(a,b)||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!==env.ADMIN_PROJECT_ID)return res.status(403).json({error:'forbidden'});try{return res.status(200).json(await workOne(databaseQuery(env),env));}catch{return res.status(503).json({error:'translation_job_failed'});}}
