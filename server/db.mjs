import { neon } from '@neondatabase/serverless';
let connection;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database not configured');
  connection ??= neon(process.env.DATABASE_URL, { fetchOptions: { signal: undefined } });
  return {
    query: (text, params = []) => connection.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(10000) } }),
    transaction: statements => connection.transaction(statements.map(s => connection.query(s, [])), { fetchOptions: { signal: AbortSignal.timeout(15000) } })
  };
}
