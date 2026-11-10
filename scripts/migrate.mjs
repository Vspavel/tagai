import { database } from '../server/db.mjs';
import { schema } from '../server/schema.mjs';
import { contentSchema } from '../admin/server/content-schema.mjs';
if (process.env.VERCEL_ENV === 'preview') {
  console.log('Preview build: production data and migrations are disabled.');
} else if (process.env.DATABASE_URL) {
  await database().transaction([...schema,...contentSchema]);
  console.log('Database schema ready.');
} else if (process.env.VERCEL) {
  throw new Error('DATABASE_URL is required for a deployed build.');
} else console.log('Local build: database migration skipped.');
