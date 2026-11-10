import { guard, databaseQuery, csrf, validMutation } from './access.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export function createPrivacyHandler({env=process.env,query}={}){
  return async(req,res)=>{
    if(!guard(req,res,env))return;
    const sql=query||databaseQuery(env),p=new URL(req.url,'https://admin.invalid').searchParams;
    try{
      if(req.method==='GET'){
        const status=p.get('status')||'open',page=Number(p.get('page')||1);
        if(!['open','resolved','all'].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000)return res.status(400).json({error:'invalid'});
        const where=status==='open'?"WHERE status IN ('pending','processing')":status==='resolved'?"WHERE status='resolved'":'';
        const [counts,rows]=await Promise.all([
          sql(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('pending','processing'))::int AS pending FROM privacy_requests`,[]),
          sql(`SELECT id,email,language,request_type,message,status,audience,created_at,updated_at,version,resolution,resolution_note,resolved_at FROM privacy_requests ${where} ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $1`,[(page-1)*50])
        ]);
        return res.status(200).json({rows:rows.slice(0,50),hasNext:rows.length>50,page,...counts[0],token:csrf(req,res,env)});
      }
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method'});}
      if(!validMutation(req,env))return res.status(403).json({error:'verification'});
      if(Number(req.headers['content-length']||0)>4096)return res.status(413).json({error:'size'});
      let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'invalid'});}
      if(!b||Array.isArray(b)||Buffer.byteLength(JSON.stringify(b))>4096||!uuid(b.id)||!uuid(b.operationId)||!['start','withdraw','delete','complete'].includes(b.action)||typeof b.note!=='string'||b.note.trim().length<5||b.note.length>1000||!Number.isSafeInteger(b.version)||b.version<1)return res.status(400).json({error:'invalid'});
      if(b.action!=='start'&&b.ownerVerified!==true)return res.status(400).json({error:'owner_unverified'});
      const prior=await sql('SELECT action FROM privacy_actions WHERE id=$1 AND request_id=$2',[b.operationId,b.id]);
      if(prior.length)return res.status(200).json({ok:true,action:prior[0].action});
      const allowed=b.action==='withdraw'?"AND request_type='withdraw'":b.action==='delete'?"AND request_type='delete'":b.action==='complete'?"AND request_type IN ('access','correct','other')":'';
      const destructive=b.action==='withdraw'||b.action==='delete';
      const mutations=destructive?['app','visits','updates'].map((audience,i)=>{
        const table=audience==='app'?'waitlist_signups':audience==='visits'?'visit_signups':'update_signups';
        const match=`email IN (SELECT email FROM changed WHERE audience IN ('${audience}','both'))`;
        return `m${i} AS (${b.action==='delete'?`DELETE FROM ${table} WHERE ${match}`:`UPDATE ${table} SET status='withdrawn',withdrawn_at=COALESCE(withdrawn_at,now()) WHERE ${match}`} RETURNING id)`;
      }).join(',')+',':'';
      // List changes, request status and audit entry commit atomically.
      const result=await sql(`WITH changed AS (
        UPDATE privacy_requests SET status=$4,resolution=$5,resolution_note=$6,updated_at=now(),version=version+1,resolved_at=CASE WHEN $4='resolved' THEN now() ELSE NULL END
        WHERE id=$1 AND status IN ('pending','processing') AND version=$2 ${allowed}
        RETURNING id,email,audience
      ), ${mutations} audit AS (
        INSERT INTO privacy_actions(id,request_id,action,note,owner_verified) SELECT $3,id,$5,$6,$7 FROM changed RETURNING request_id
      ) SELECT request_id FROM audit`,[b.id,b.version,b.operationId,b.action==='start'?'processing':'resolved',b.action,b.note.trim(),b.ownerVerified===true]);
      if(!result.length)return res.status(409).json({error:'changed'});
      return res.status(200).json({ok:true,action:b.action});
    }catch{console.error('admin_privacy_unavailable');return res.status(503).json({error:'unavailable'});}
  };
}
