import {readFile} from 'node:fs/promises';
import {database} from '../server/db.mjs';
import {releaseSnapshot} from '../admin/server/content-model.mjs';
export async function contentSnapshot(){
 if(process.env.VERCEL_ENV==='production'&&process.env.DATABASE_URL){
 const rows=await database().query("SELECT id,snapshot FROM cms_releases WHERE status IN ('pending','live') ORDER BY created_at DESC LIMIT 1",[]);
 if(rows.length&&rows[0].snapshot.schemaVersion===2){releaseSnapshot(rows[0].snapshot.documents);return {releaseId:rows[0].id,...rows[0].snapshot};}
 }
 const documents=JSON.parse(await readFile(new URL('../admin/server/content-seed.json',import.meta.url),'utf8'));
 return {releaseId:'repository-baseline',...releaseSnapshot(documents)};
}
