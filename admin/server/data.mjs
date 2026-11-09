import { guard, databaseQuery } from './access.mjs';
const CITIES=['Cyprus','Paris','London','Dubai','Abu Dhabi','Doha','New York','Hong Kong','Elsewhere'];
const records=`(SELECT *, 'app'::text AS audience FROM waitlist_signups UNION ALL SELECT *, 'visits'::text AS audience FROM visit_signups) AS signups`;
export function filters(query) {
  const p=new URLSearchParams(query),values=[],clauses=[];
  const bind=v=>{values.push(v);return `$${values.length}`;};
  const q=(p.get('q')||'').trim();if(q.length>254)throw new Error('filters');
  if(q)clauses.push(`email ILIKE ${bind('%'+q.replace(/[\\%_]/g,'\\$&')+'%')}`);
  for(const [key,column,allowed] of [['city','city',CITIES],['language','language',['en','fr','el']]]){
    const v=p.get(key);if(v){if(!allowed.includes(v))throw new Error('filters');clauses.push(`${column} = ${bind(v)}`);}
  }
  const audience=p.get('audience')||'app',status=p.get('status')||'active';
  if(!['app','visits'].includes(audience)||!['active','withdrawn','all'].includes(status))throw new Error('filters');
  clauses.push(`audience = ${bind(audience)}`);if(status!=='all')clauses.push(`status = ${bind(status)}`);
  for(const [key,op,plus] of [['from','>=',''],['to','<'," + interval '1 day'"]]){
    const v=p.get(key);if(v){if(!/^20\d{2}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error('filters');clauses.push(`created_at ${op} ((${bind(v)}::date${plus})::timestamp AT TIME ZONE 'Asia/Nicosia')`);}
  }
  if(p.get('from')&&p.get('to')&&p.get('from')>p.get('to'))throw new Error('filters');
  if(p.get('qa')!=='1')clauses.push("source <> 'INTERNAL_QA'");
  const page=Number(p.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new Error('filters');
  return {where:'WHERE '+clauses.join(' AND '),values,page,audience};
}
export function csv(rows){
  const keys=['email','audience','status','city','language','created_at','source','campaign','email_verified','consent_at','consent_version'];
  const cell=v=>{let s=v instanceof Date?v.toISOString():String(v??'');if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\ufeff'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}
export function createAdminHandler({env=process.env,query}={}){
  return async(req,res)=>{
    if(!guard(req,res,env))return;
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method'});}
    const p=new URL(req.url,'https://admin.invalid').searchParams;let f;try{f=filters(p);}catch{return res.status(400).json({error:'filters'});}
    const sql=query||databaseQuery(env);
    try{
      const cols='id,email,city,language,created_at,source,campaign,email_verified,consent_at,consent_version,status,audience';
      if(p.get('format')==='csv'){
        const rows=await sql(`SELECT ${cols} FROM ${records} ${f.where} ORDER BY created_at DESC,id DESC LIMIT 10001`,f.values);
        if(rows.length>10000)return res.status(422).json({error:'export_limit'});
        res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="tagai-'+f.audience+'.csv"');return res.status(200).send(csv(rows));
      }
      const totals=await sql(`SELECT count(*)::int AS total,count(*) FILTER(WHERE created_at>=now()-interval '7 days')::int AS week,count(*) FILTER(WHERE created_at>=now()-interval '30 days')::int AS month FROM ${records} ${f.where}`,f.values);
      const page=Math.min(f.page,Math.max(1,Math.ceil(totals[0].total/50)));
      const rows=await sql(`SELECT ${cols} FROM ${records} ${f.where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $${f.values.length+1}`,[...f.values,(page-1)*50]);
      const charts=await Promise.allSettled([
        sql(`WITH dates AS (SELECT generate_series((now() AT TIME ZONE 'Asia/Nicosia')::date-29,(now() AT TIME ZONE 'Asia/Nicosia')::date,interval '1 day')::date AS day), counts AS (SELECT (created_at AT TIME ZONE 'Asia/Nicosia')::date AS day,count(*)::int AS count FROM ${records} ${f.where} GROUP BY 1) SELECT dates.day::text AS date,COALESCE(counts.count,0)::int AS count FROM dates LEFT JOIN counts USING(day) ORDER BY dates.day`,f.values),
        sql(`SELECT city AS label,count(*)::int AS count FROM ${records} ${f.where} GROUP BY 1 ORDER BY 2 DESC`,f.values),
        sql(`SELECT source AS label,count(*)::int AS count FROM ${records} ${f.where} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,f.values)
      ]);
      const chartData=Object.fromEntries(['daily','cities','sources'].map((key,i)=>[key,charts[i].status==='fulfilled'?charts[i].value:null]));
      return res.status(200).json({...totals[0],rows,...chartData,page,pageSize:50,generatedAt:new Date().toISOString(),ga4:env.GA4_PROPERTY_ID&&/^\d+$/.test(env.GA4_PROPERTY_ID)?env.GA4_PROPERTY_ID:null});
    }catch{console.error('admin_data_unavailable');return res.status(503).json({error:'unavailable'});}
  };
}
