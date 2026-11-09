import { randomBytes, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
export function guard(req,res,env){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
  if(env.ADMIN_ENABLED!=='1'||!env.ADMIN_PROJECT_ID||env.VERCEL_PROJECT_ID!==env.ADMIN_PROJECT_ID||env.VERCEL_ENV!=='production'||!env.DATABASE_URL){res.status(503).json({error:'admin_unavailable'});return false;}
  if(req.headers['sec-fetch-site']==='cross-site'){res.status(403).json({error:'origin'});return false;}return true;
}
export const databaseQuery=env=>(text,params=[])=>neon(env.DATABASE_URL).query(text,params,{fetchOptions:{signal:AbortSignal.timeout(5000)}});
const cookieName=env=>env.LOCAL_ADMIN_TEST==='1'?'tagai-admin-csrf-local':'__Host-tagai-admin-csrf';
function cookie(req,env){const name=cookieName(env);return String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);}
export function csrf(req,res,env){
  let token=cookie(req,env);if(!/^[a-f0-9]{64}$/.test(token||''))token=randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie',`${cookieName(env)}=${token}; Path=/; ${env.LOCAL_ADMIN_TEST==='1'?'':'Secure; '}HttpOnly; SameSite=Strict; Max-Age=3600`);return token;
}
export function validMutation(req,env){
  const origins=new Set(['https://tagai-admin-vspa.vercel.app']);
  for(const host of [env.VERCEL_URL,env.VERCEL_PROJECT_PRODUCTION_URL])if(host)origins.add('https://'+host);
  if(env.LOCAL_ADMIN_TEST==='1')for(const host of ['localhost','terminal.local'])origins.add(`http://${host}:${env.DEV_PORT||4174}`);
  if(!origins.has(req.headers.origin)||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return false;
  const a=cookie(req,env)||'',b=req.headers['x-csrf-token']||'';
  return /^[a-f0-9]{64}$/.test(a)&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
