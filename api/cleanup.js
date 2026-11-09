import { database } from '../server/db.mjs';
import { safeEqual } from '../server/security.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'method'});
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`)) return res.status(401).json({error:'unauthorized'});
  try {
    await database().transaction([
      'DELETE FROM request_limits WHERE expires_at < now()',
      'DELETE FROM waitlist_signups WHERE expires_at < now()',
      'DELETE FROM visit_signups WHERE expires_at < now()',
      'DELETE FROM privacy_requests WHERE expires_at < now()'
    ]);
    return res.status(200).json({ok:true});
  } catch { return res.status(503).json({error:'unavailable'}); }
}
