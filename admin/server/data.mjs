import { neon } from '@neondatabase/serverless';
const CITIES=['Cyprus','Paris','London','Dubai','Abu Dhabi','Doha','New York','Hong Kong','Elsewhere'];
export function filters(query) {
  const p=new URLSearchParams(query), values=[], clauses=[];
  const bind=v=>{values.push(v);return `$${values.length}`;};
  const q=(p.get('q')||'').trim();
  if(q.length>254)throw new Error('filters');
  if(q)clauses.push(`email ILIKE ${bind('%'+q.replace(/[\\%_]/g,'\\$&')+'%')}`);
  for(const [key,column,allowed] of [['city','city',CITIES],['language','language',['en','fr','el']]]){
    const v=p.get(key);if(v){if(!allowed.includes(v))throw new Error('filters');clauses.push(`${column} = ${bind(v)}`);}
  }
  for(const [key,op,plus] of [['from','>=',''],['to','<'," + interval '1 day'"]]){
    const v=p.get(key);if(v){if(!/^20\d{2}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error('filters');clauses.push(`created_at ${op} ((${bind(v)}::date${plus})::timestamp AT TIME ZONE 'Asia/Nicosia')`);}
  }
  if(p.get('from')&&p.get('to')&&p.get('from')>p.get('to'))throw new Error('filters');
  if(p.get('qa')!=='1')clauses.push("source <> 'INTERNAL_QA'");
  const page=Number(p.get('page')||1);
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw new Error('filters');
  return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',values,page};
}
export function csv(rows){
  const keys=['email','city','language','created_at','source','campaign','email_verified','consent_at','consent_version'];
  const cell=v=>{let s=v instanceof Date?v.toISOString():String(v??'');if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\ufeff'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}
export function createAdminHandler({env=process.env,query}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
    // This API exists ONLY in the separate, fully Vercel-authenticated admin project.
    // It must fail closed if copied to the public project or a preview deployment.
    if(env.ADMIN_ENABLED!=='1'||!env.ADMIN_PROJECT_ID||env.VERCEL_PROJECT_ID!==env.ADMIN_PROJECT_ID||env.VERCEL_ENV!=='production'||!env.DATABASE_URL)return res.status(503).json({error:'admin_unavailable'});
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method'});}
    if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'origin'});
    const p=new URL(req.url,'https://admin.invalid').searchParams;
    let f;try{f=filters(p);}catch{return res.status(400).json({error:'filters'});}
    const sql=query||((text,params=[])=>neon(env.DATABASE_URL).query(text,params,{fetchOptions:{signal:AbortSignal.timeout(10000)}}));
    try{
      const cols='email,city,language,created_at,source,campaign,email_verified,consent_at,consent_version';
      const totals=await sql(`SELECT count(*)::int AS total,count(*) FILTER(WHERE created_at>=now()-interval '7 days')::int AS week,count(*) FILTER(WHERE created_at>=now()-interval '30 days')::int AS month FROM waitlist_signups ${f.where}`,f.values);
      if(p.get('format')==='csv'){
        // Read one extra row to detect a concurrent insertion beyond the export limit.
        const rows=await sql(`SELECT ${cols} FROM waitlist_signups ${f.where} ORDER BY created_at DESC,id DESC LIMIT 10001`,f.values);
        if(rows.length>10000)return res.status(422).json({error:'export_limit'});
        res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="tagai-waitlist.csv"');return res.status(200).send(csv(rows));
      }
      const [rows,daily,cities,languages,sources,privacy]=await Promise.all([
        sql(`SELECT ${cols} FROM waitlist_signups ${f.where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $${f.values.length+1}`,[...f.values,(f.page-1)*50]),
        sql(`SELECT (created_at AT TIME ZONE 'Asia/Nicosia')::date::text AS date,count(*)::int AS count FROM waitlist_signups ${f.where}${f.where?' AND':' WHERE'} created_at>=now()-interval '30 days' GROUP BY 1 ORDER BY 1`,f.values),
        sql(`SELECT city AS label,count(*)::int AS count FROM waitlist_signups ${f.where} GROUP BY 1 ORDER BY 2 DESC`,f.values),
        sql(`SELECT language AS label,count(*)::int AS count FROM waitlist_signups ${f.where} GROUP BY 1 ORDER BY 2 DESC`,f.values),
        sql(`SELECT source AS label,count(*)::int AS count FROM waitlist_signups ${f.where} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,f.values),
        sql("SELECT email,language,request_type,message,status,created_at FROM privacy_requests WHERE status='pending' ORDER BY created_at LIMIT 100",[])
      ]);
      return res.status(200).json({...totals[0],rows,daily,cities,languages,sources,privacy,page:f.page,pageSize:50,generatedAt:new Date().toISOString(),ga4:env.GA4_PROPERTY_ID&&/^\d+$/.test(env.GA4_PROPERTY_ID)?env.GA4_PROPERTY_ID:null});
    }catch{console.error('admin_data_unavailable');return res.status(503).json({error:'unavailable'});}
  };
}
