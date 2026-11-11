import {randomUUID,createHmac,createHash} from 'node:crypto';
import {database} from './db.mjs';
import {allowedOrigin,challenge,verifyChallenge,clientAddress,rateBucket,normalizeEmail,LANGUAGES} from './security.mjs';
import {emailReady,sendMail,confirmationMail} from './mail.mjs';
import {cleanAttribution} from './attribution.mjs';
const TABLES={app:'waitlist_signups',visits:'visit_signups',updates:'update_signups'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest=s=>createHash('sha256').update(s).digest('hex');
const quota=`INSERT INTO request_limits(bucket,hits,expires_at) VALUES($1,1,now()+interval '2 hours') ON CONFLICT(bucket) DO UPDATE SET hits=LEAST(request_limits.hits+1,100000) RETURNING hits`;
const json=v=>JSON.stringify(v);
const same=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
export function createRegistrationHandler({env=process.env,query=(s,p)=>database().query(s,p),fetcher=fetch,clock=Date.now}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(n,d)=>res.status(n).json(d);
 if((env.VERCEL&&env.VERCEL_ENV!=='production')||!env.DATABASE_URL||!env.FORM_SECRET||env.FORM_SECRET.length<32)return send(503,{error:'unavailable'});
 const address=clientAddress(req,env);
 if(req.method==='GET')return send(200,{ready:true,email:emailReady(env),token:challenge(address,env.FORM_SECRET,clock())});
 if(req.method!=='POST')return send(405,{error:'method'});
 if(!allowedOrigin(req.headers.origin,env))return send(403,{error:'origin'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'content_type'});
 let b;try{const raw=typeof req.body==='string'?req.body:json(req.body);if(Buffer.byteLength(raw)>12000)return send(413,{error:'size'});b=JSON.parse(raw);}catch{return send(400,{error:'invalid'});}
 if(!b||Array.isArray(b)||typeof b!=='object'||b.website||!verifyChallenge(b.token,address,env.FORM_SECRET,clock()))return send(400,{error:'verification'});
 if(!LANGUAGES.includes(b.language))return send(400,{error:'invalid'});
 try{
 const count=await query(quota,[rateBucket(address,env.FORM_SECRET,clock())+':v2']);if(count[0].hits>30){res.setHeader('Retry-After','3600');return send(429,{error:'rate_limit'});}
 if(['inspect','confirm','preferences','frequency'].includes(b.action)){
  if(typeof b.accessToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.accessToken))return send(400,{error:'expired'});
  const row=(await query('SELECT * FROM subscription_requests WHERE token_hash=$1 AND expires_at>now()',[digest(b.accessToken)]))[0];if(!row)return send(400,{error:'expired'});
  const wasConfirmed=!!row.confirmed_at;let activated=[];
  if(b.action==='inspect'&&!row.confirmed_at)return send(200,{needsConfirmation:true,selections:row.selections,purpose:row.purpose});
  if(b.action==='confirm'&&!row.confirmed_at){
   // The atomic claim prevents a repeated confirmation from undoing a later unsubscribe.
   const inserts=row.purpose==='subscribe'?row.selections.map((list,i)=>`s${i} AS (INSERT INTO ${TABLES[list]}(id,email,city,language,consent_version,email_verified,activation_count,source,campaign,attribution) SELECT gen_random_uuid(),email,'',language,'2026-11-11-confirmed',true,1,COALESCE(attribution->'first'->>'source',''),COALESCE(attribution->'first'->>'campaign',''),attribution FROM claimed ON CONFLICT(email) DO UPDATE SET email_verified=true,status='active',withdrawn_at=NULL,consent_at=now(),consent_version='2026-11-11-confirmed',expires_at=now()+interval '12 months',activation_count=${TABLES[list]}.activation_count+1 WHERE NOT ${TABLES[list]}.email_verified OR ${TABLES[list]}.status<>'active' OR ${TABLES[list]}.expires_at<=now() RETURNING '${list}'::text AS audience,activation_count,attribution)`):[];
   activated=await query(`WITH claimed AS (UPDATE subscription_requests SET confirmed_at=now() WHERE id=$1 AND confirmed_at IS NULL RETURNING *)${inserts.length?','+inserts.join(','):''} ${inserts.length?row.selections.map((_,i)=>`SELECT * FROM s${i}`).join(' UNION ALL '):'SELECT NULL::text AS audience FROM claimed WHERE false'}`,[row.id]);
   if(row.purpose==='subscribe'&&row.selections.includes('visits'))await query(`INSERT INTO subscriber_profiles(email,visit_cities) VALUES($1,$2::jsonb) ON CONFLICT(email) DO UPDATE SET visit_cities=excluded.visit_cities,updated_at=now()`,[row.email,json(row.cities)]);
   row.confirmed_at=true;
  }
  if(!row.confirmed_at)return send(403,{error:'verify_first'});
  if(b.action==='preferences'){
   if(!b.preferences||Object.keys(b.preferences).sort().join(',')!=='app,updates,visits'||Object.values(b.preferences).some(v=>typeof v!=='boolean'))return send(400,{error:'invalid'});
   const updates=Object.entries(TABLES).map(([list,table],i)=>b.preferences[list]?`p${i} AS (INSERT INTO ${table}(id,email,city,language,consent_version,email_verified,activation_count,source,campaign,attribution) VALUES(gen_random_uuid(),$1,'',$2,'2026-11-11-preferences',true,1,COALESCE($3::jsonb->'first'->>'source',''),COALESCE($3::jsonb->'first'->>'campaign',''),$3::jsonb) ON CONFLICT(email) DO UPDATE SET email_verified=true,status='active',withdrawn_at=NULL,consent_at=now(),consent_version='2026-11-11-preferences',expires_at=now()+interval '12 months',activation_count=${table}.activation_count+1 WHERE NOT ${table}.email_verified OR ${table}.status<>'active' OR ${table}.expires_at<=now() RETURNING '${list}'::text AS audience,activation_count,attribution)`:`p${i} AS (UPDATE ${table} SET status='withdrawn',withdrawn_at=now() WHERE email=$1 AND status<>'withdrawn' RETURNING '${list}'::text AS audience,activation_count,attribution)`);
   // Keep the parameter shape valid even when every list is disabled.
   activated=await query(`WITH identity AS (SELECT $1::text AS email,$2::text AS language,$3::jsonb AS attribution),${updates.join(',')} ${Object.keys(TABLES).map((list,i)=>`SELECT * FROM p${i}${b.preferences[list]?'':' WHERE false'}`).join(' UNION ALL ')}`,[row.email,b.language,json(cleanAttribution(row.attribution))]);
  }
  if(b.action==='frequency'){
   if(!['monthly','yearly','rarely'].includes(b.frequency))return send(400,{error:'invalid'});
   await query(`INSERT INTO subscriber_profiles(email,frequency) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET frequency=excluded.frequency,updated_at=now()`,[row.email,b.frequency]);
  }
  const rows=await query(Object.entries(TABLES).map(([k,t])=>`SELECT '${k}' AS audience,status,email_verified,expires_at>now() AS unexpired FROM ${t} WHERE email=$1`).join(' UNION ALL '),[row.email]);
  return send(200,{accepted:true,email:row.email,preferences:Object.fromEntries(Object.keys(TABLES).map(k=>[k,rows.some(r=>r.audience===k&&r.status==='active'&&r.email_verified&&r.unexpired)])),activated:activated.map(r=>({audience:r.audience,firstTime:r.activation_count===1,attribution:cleanAttribution(r.attribution)})),alreadyConfirmed:b.action==='confirm'&&wasConfirmed});
 }
 if(!['subscription','access','enquiry'].includes(b.action)||!uuid.test(b.requestId||''))return send(400,{error:'invalid'});
 const email=normalizeEmail(b.email);if(!email)return send(400,{error:'invalid'});
 const attribution=cleanAttribution(b.attribution,b.source),source=attribution.first.source||'',campaign=attribution.first.campaign||'';
 if(b.action==='enquiry'){
  if(!['pilot','visit'].includes(b.kind)||!b.details||Array.isArray(b.details))return send(400,{error:'invalid'});
  const details={};for(const k of ['organisation','name','role','city','otherCity','dates','url','message']){const v=b.details[k]??'';if(typeof v!=='string'||v.length>(k==='message'?2000:240))return send(400,{error:'invalid'});details[k]=v.trim();}
  if(!details.organisation||(b.kind==='visit'&&(!['artist','gallery'].includes(details.role)||!['Nicosia','Limassol','Paris','Other'].includes(details.city)||(details.city==='Other'&&!details.otherCity))))return send(400,{error:'invalid'});
  if(details.url){try{if(!['http:','https:'].includes(new URL(details.url).protocol))return send(400,{error:'invalid'});}catch{return send(400,{error:'invalid'});}}
  const saved=await query(`INSERT INTO enquiries(id,kind,email,language,details,source) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(id) DO NOTHING RETURNING id`,[b.requestId,b.kind,email,b.language,json(details),source]);
  if(!saved.length){const existing=(await query('SELECT kind,email,details FROM enquiries WHERE id=$1',[b.requestId]))[0];if(!existing||existing.email!==email||existing.kind!==b.kind||!same(existing.details,details))return send(409,{error:'conflict'});}
  // Contact records are never added to marketing lists. Email is optional; durable admin receipt is authoritative.
  if(saved.length&&emailReady(env)&&env.ENQUIRY_RECIPIENT&&env.EMAIL_REPLY_TO){
   const summary=Object.entries(details).filter(([,v])=>v).map(([k,v])=>k+': '+v).join('\n');
   const notification=await sendMail({to:env.ENQUIRY_RECIPIENT,subject:'TAGAI: '+(b.kind==='pilot'?'pilot enquiry':'visit proposal'),text:'Contact: '+email+'\n\n'+summary,id:'enquiry-team-'+b.requestId,replyTo:email},env,fetcher);
   const receipt=await sendMail({to:email,subject:b.kind==='pilot'?'We’ve received your TAGAI pilot enquiry':'We’ve received your artist visit proposal',text:(b.kind==='pilot'?'Thank you for telling us about '+details.organisation+'.\n\nWe’ve received your enquiry and will reply to discuss the event, the conversations and the reporting scope.':'We’ve received your proposal for a TAGAI artist visit in '+(details.otherCity||details.city)+'.\n\nWe’ll contact you to discuss the format and arrangements. A visit will be announced only after the details have been agreed with you.')+'\n\n'+summary+'\n\nYou can reply to this email with any corrections or additional information.',id:'enquiry-receipt-'+b.requestId,replyTo:env.EMAIL_REPLY_TO},env,fetcher);
   await query('UPDATE enquiries SET notification_status=$2,receipt_status=$3 WHERE id=$1',[b.requestId,notification,receipt]);
  }
  return send(200,{accepted:true,receiptId:b.requestId,created:saved.length>0});
 }
 const selections=b.action==='access'?[]:b.selections;
 if(!Array.isArray(selections)||selections.length>3||(b.action==='subscription'&&!selections.length)||new Set(selections).size!==selections.length||selections.some(s=>!TABLES[s]))return send(400,{error:'invalid'});
 const cities=b.cities||[];if(!Array.isArray(cities)||cities.length>3||cities.some(c=>!['Nicosia','Limassol','Paris'].includes(c)))return send(400,{error:'invalid'});
 if(b.action==='access'&&!emailReady(env))return send(503,{error:'email_unavailable'});
 const emailCount=await query(quota,['email:'+createHmac('sha256',env.FORM_SECRET).update(email+':'+Math.floor(clock()/3600000)).digest('hex')]);if(emailCount[0].hits>5)return send(429,{error:'rate_limit'});
 const token=createHmac('sha256',env.FORM_SECRET).update('subscription:'+b.requestId).digest('base64url');
 const inserts=selections.map((s,i)=>`s${i} AS (INSERT INTO ${TABLES[s]}(id,email,city,language,consent_version,source,campaign,attribution) SELECT gen_random_uuid(),email,'',language,'2026-11-11-request',$8,$9,attribution FROM saved ON CONFLICT(email) DO NOTHING RETURNING '${s}'::text AS audience)`);
 let created=[];
 const existing=await query('SELECT * FROM subscription_requests WHERE id=$1',[b.requestId]);
 if(existing.length){const row=existing[0];if(row.email!==email||row.purpose!==(b.action==='access'?'access':'subscribe')||json(row.selections)!==json(selections)||json(row.cities)!==json(cities))return send(409,{error:'conflict'});if(new Date(row.expires_at).getTime()<=clock())return send(400,{error:'expired'});if(row.mail_status==='sent')return send(200,{accepted:true,emailStatus:'sent',createdAudiences:[]});}
 else created=await query(`WITH saved AS (INSERT INTO subscription_requests(id,email,language,selections,cities,token_hash,purpose,attribution) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$10::jsonb) ON CONFLICT(id) DO NOTHING RETURNING *),source_param AS (SELECT $8::text,$9::text)${inserts.length?','+inserts.join(','):''} ${inserts.length?selections.map((_,i)=>`SELECT audience FROM s${i}`).join(' UNION ALL '):'SELECT NULL::text AS audience FROM saved WHERE false'}`,[b.requestId,email,b.language,json(selections),json(cities),digest(token),b.action==='access'?'access':'subscribe',source,campaign,json(attribution)]);
 const actual=(await query('SELECT email,selections,cities,purpose FROM subscription_requests WHERE id=$1',[b.requestId]))[0];if(!actual||actual.email!==email||actual.purpose!==(b.action==='access'?'access':'subscribe')||json(actual.selections)!==json(selections)||json(actual.cities)!==json(cities))return send(409,{error:'conflict'});
 // Preserve the original acquisition; a later campaign may update only the last touch.
 if(!existing.length&&attribution.last.source&&selections.length)await query(`WITH ${selections.map((list,i)=>`t${i} AS (UPDATE ${TABLES[list]} SET attribution=jsonb_set(attribution,'{last}',$2::jsonb,true) WHERE email=$1 RETURNING id)`).join(',')} SELECT 1`,[email,json(attribution.last)]);
 const emailStatus=await sendMail({...confirmationMail(email,b.language,selections,cities,token,b.action==='access'),id:'subscription-'+b.requestId},env,fetcher);
 await query('UPDATE subscription_requests SET mail_status=$2 WHERE id=$1',[b.requestId,emailStatus]);
 return send(200,{accepted:true,emailStatus,createdAudiences:created.map(r=>r.audience)});
 }catch{console.error('registration_operation_unconfirmed');return send(503,{error:'unavailable'});}
};}
