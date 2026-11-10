import {guard,csrf,validMutation,databaseQuery} from './access.mjs';
export function createEnquiryHandler({env=process.env,query=databaseQuery(env)}={}){return async(req,res)=>{
 if(!guard(req,res,env))return;
 try{
  if(req.method==='GET'){
   const p=new URL(req.url,'https://admin.invalid').searchParams,kind=p.get('kind')||'pilot',status=p.get('status')||'open',page=Number(p.get('page')||1);
   if(!['pilot','visit'].includes(kind)||!['open','new','in_progress','closed','all'].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000)return res.status(400).json({error:'invalid'});
   const where=`kind=$1 AND source<>'INTERNAL_QA'`+(status==='all'?'':status==='open'?" AND status IN ('new','in_progress')":' AND status=$2'),params=status==='all'||status==='open'?[kind]:[kind,status];
   const counts=await query(`SELECT count(*)::int AS total FROM enquiries WHERE ${where}`,params);
   const actual=Math.min(page,Math.max(1,Math.ceil(counts[0].total/50)));
   const rows=await query(`SELECT id,kind,email,language,details,status,version,created_at,updated_at,notification_status,receipt_status FROM enquiries WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $${params.length+1}`,[...params,(actual-1)*50]);
   return res.status(200).json({rows,total:counts[0].total,page:actual,token:csrf(req,res,env)});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method'});
  if(!validMutation(req,env))return res.status(403).json({error:'verification'});
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>2048)return res.status(413).json({error:'size'});
  let b;try{b=JSON.parse(raw);}catch{return res.status(400).json({error:'invalid'});}
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(b.id||'')||!Number.isSafeInteger(b.version)||b.version<1||!['new','in_progress','closed'].includes(b.status))return res.status(400).json({error:'invalid'});
  const rows=await query('UPDATE enquiries SET status=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING id,version,status',[b.id,b.version,b.status]);
  if(!rows.length){const current=(await query('SELECT version,status FROM enquiries WHERE id=$1',[b.id]))[0];if(current?.version===b.version+1&&current.status===b.status)return res.status(200).json({ok:true,...current});return res.status(409).json({error:'changed'});}
  return res.status(200).json({ok:true,...rows[0]});
 }catch{console.error('admin_enquiries_unavailable');return res.status(503).json({error:'unavailable'});}
};}
