import { randomUUID } from 'node:crypto';
import { database } from './db.mjs';
import { CONSENT_VERSION, CITIES, LANGUAGES, allowedOrigin, challenge, verifyChallenge, clientAddress, rateBucket, normalizeEmail } from './security.mjs';

const quota = `INSERT INTO request_limits(bucket,hits,expires_at) VALUES ($1,1,now()+interval '2 hours')
  ON CONFLICT(bucket) DO UPDATE SET hits = LEAST(request_limits.hits+1,100000) RETURNING hits`;

export function createHandler({ db = database, env = process.env, clock = Date.now } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => res.status(status).json(body);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (env.VERCEL && env.VERCEL_ENV !== 'production') return send(503,{error:'unavailable'});
    if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return send(405,{error:'method'}); }
    if (!env.DATABASE_URL || !env.FORM_SECRET || env.FORM_SECRET.length < 32) return send(503,{error:'unavailable'});
    const address = clientAddress(req,env);
    if (req.method === 'GET') return send(200,{ready:true,token:challenge(address,env.FORM_SECRET,clock())});
    if (!allowedOrigin(req.headers.origin,env)) return send(403,{error:'origin'});
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415,{error:'content_type'});
    if (Number(req.headers['content-length'] || 0) > 4096) return send(413,{error:'size'});
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return send(400,{error:'invalid'}); }
    if (!body || Array.isArray(body) || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 4096) return send(400,{error:'invalid'});
    if (body.website || !verifyChallenge(body.token,address,env.FORM_SECRET,clock())) return send(400,{error:'verification'});
    const email = normalizeEmail(body.email);
    if (!email || !LANGUAGES.includes(body.language)) return send(400,{error:'invalid'});
    const bucket = rateBucket(address,env.FORM_SECRET,clock()), id = randomUUID();
    let statement, values;
    if (body.kind === 'privacy') {
      if (!['withdraw','access','correct','delete','other'].includes(body.requestType) || typeof body.message !== 'string' || body.message.length > 1500) return send(400,{error:'invalid'});
      if (!['app','visits','both'].includes(body.audience || 'app')) return send(400,{error:'invalid'});
      if (body.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return send(400,{error:'invalid'});
      statement = `WITH quota AS (${quota}), saved AS (
        INSERT INTO privacy_requests(id,email,language,request_type,message,audience)
        SELECT $2,$3,$4,$5,$6,$7 FROM quota WHERE hits <= 20 ON CONFLICT(id) DO NOTHING RETURNING id)
        SELECT hits <= 20 AS accepted FROM quota`;
      values = [bucket,body.requestId || id,email,body.language,body.requestType,body.message,body.audience || 'app'];
    } else {
      if (body.kind && body.kind !== 'waitlist') return send(400,{error:'invalid'});
      if (!['app','visits'].includes(body.audience || 'app')) return send(400,{error:'invalid'});
      if (body.consent !== true || !CITIES.includes(body.city ?? '')) return send(400,{error:'invalid'});
      for (const k of ['source','campaign']) if (body[k] !== undefined && (typeof body[k] !== 'string' || body[k].length > 120)) return send(400,{error:'invalid'});
      statement = `WITH quota AS (${quota}), saved AS (
        INSERT INTO ${body.audience === 'visits' ? 'visit_signups' : 'waitlist_signups'}(id,email,city,language,consent_version,source,campaign)
        SELECT $2,$3,$4,$5,$6,$7,$8 FROM quota WHERE hits <= 20
        ON CONFLICT(email) DO NOTHING RETURNING id)
        SELECT hits <= 20 AS accepted FROM quota`;
      values = [bucket,id,email,body.city || '',body.language,body.audience === 'visits' ? '2026-11-09-visits-v1' : CONSENT_VERSION,body.source || '',body.campaign || ''];
    }
    try {
      const rows = await db().query(statement,values);
      if (!rows[0]?.accepted) { res.setHeader('Retry-After','3600'); return send(429,{error:'rate_limit'}); }
      // Identical response for new and existing addresses; no subscriber enumeration.
      return send(200,{accepted:true});
    } catch (error) {
      // Never log request bodies, email addresses, SQL parameters or connection strings.
      console.error('waitlist_storage_failure', { code: /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'storage' });
      return send(503,{error:'unavailable'});
    }
  };
}
