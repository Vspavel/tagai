import {createContentHandler} from '../server/content.mjs';
// Cross-site navigation allowed only for OAuth callback. The handler verifies a one-time, cookie-bound state.
const handle=createContentHandler();
export default async function(req,res){if(req.method==='GET'&&new URL(req.url,'https://tagai-admin-vspa.vercel.app').searchParams.has('callback')){const headers={...req.headers};delete headers['sec-fetch-site'];return handle({method:req.method,url:req.url,body:req.body,headers},res);}return handle(req,res);}
