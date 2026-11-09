import {cp,rm,mkdir} from 'node:fs/promises';
if(process.env.VERCEL&&(!process.env.ADMIN_PROJECT_ID||process.env.VERCEL_PROJECT_ID!==process.env.ADMIN_PROJECT_ID))throw new Error('Admin project identity required');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
console.log('Built private TAGAI admin');
