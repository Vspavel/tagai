import { database } from '../server/db.mjs';
import { schema } from '../server/schema.mjs';
if (process.env.DATABASE_URL) {
  await database().transaction(schema);
  console.log('Database schema ready.');
} else if (process.env.VERCEL) {
  throw new Error('DATABASE_URL is required for a deployed build.');
} else console.log('Local build: database migration skipped.');
