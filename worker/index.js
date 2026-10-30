import { createApi } from '../server/api.mjs';
import { D1Repository } from '../server/d1.mjs';
import ASSETS from './assets.generated.js';

let api;
export default {
  async fetch(request,env) {
    if (!env.DB) return new Response('Datenbank nicht verfügbar.',{status:503});
    if (!api) {
      api=createApi({repository:new D1Repository(env.DB),origin:env.PUBLIC_ORIGIN,clientIp:req=>req.headers.get('CF-Connecting-IP') || 'unknown',assets:async(req,path,headers)=>{
        const name=path==='/'?'index.html':path.slice(1);
        if (!Object.hasOwn(ASSETS,name) || !['GET','HEAD'].includes(req.method)) return new Response('Nicht gefunden.',{status:404,headers});
        const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
        return new Response(req.method==='HEAD'?null:ASSETS[name],{headers:{...headers,'Content-Type':type+'; charset=utf-8'}});
      }});
    }
    return api(request);
  }
};
