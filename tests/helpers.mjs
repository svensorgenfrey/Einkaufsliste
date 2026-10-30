import { createServer } from 'node:http';
import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from '../server/node_modules/fake-indexeddb/build/esm/index.js';
import { createApp, CouchRepository } from '../server/server.mjs';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const protocol=section('// BEGIN SHARE PROTOCOL','// END SHARE PROTOCOL');
const storage=section('/** @returns {string} */\nfunction uuid','// BEGIN SHARE SYNC');
const sync=section('// BEGIN SHARE SYNC','// END SHARE SYNC');
export function browser(origin, indexedDB=new IDBFactory(), fetcher=fetch) {
  const context=vm.createContext({crypto:webcrypto,indexedDB,window:{indexedDB},TextEncoder,TextDecoder,btoa,atob,structuredClone,AbortController,AbortSignal,fetch:fetcher,console,showFatal:message=>{throw new Error(message);}});
  vm.runInContext(protocol+'\n'+storage+'\n'+sync+'\nglobalThis.api={P:ShareProtocol,LocalStore,ShareTransport,ShareSync,ShareError,makeList,uuid};',context);
  const api=context.api;
  return {...api,indexedDB,transport:new api.ShareTransport(origin),async open(){this.store=await api.LocalStore.open();await this.store.initialize();this.engine=new api.ShareSync(this.store,this.transport);return this;},async sync(id){return this.engine.sync(id,new AbortController().signal);}};
}
export const plain=value=>JSON.parse(JSON.stringify(value));
export async function listen(handler) {
  const server=createServer(handler); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

/** A small HTTP contract fixture, not a substitute for testing a real CouchDB deployment. */
export async function fixture(t) {
  const documents=new Map(); let initialized=false; let now=Date.now(); let contentWrites=0; let security=null;
  const couch=await listen(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(req.headers.authorization!==`Basic ${Buffer.from('test:password').toString('base64')}`) return send(401,{error:'unauthorized'});
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/shopping_shares' && req.method==='PUT') {if(initialized)return send(412,{});initialized=true;return send(201,{ok:true});}
    let body;
    if(req.method==='PUT') {let raw='';for await(const chunk of req)raw+=chunk;body=JSON.parse(raw);}
    if(path==='/shopping_shares/_security') {security=body;return send(200,{ok:true});}
    if(!path.startsWith('/shopping_shares/share:'))return send(404,{});
    const id=path.split('/share:')[1], old=documents.get(id);
    if(req.method==='GET')return old?send(200,old):send(404,{});
    if(req.method==='PUT') {
      if((old && old._rev!==body._rev)||(!old&&body._rev))return send(409,{error:'conflict'});
      if(body.content && JSON.stringify(body.content)!==JSON.stringify(old?.content))contentWrites++;
      const rev=`${Number(old?._rev.split('-')[0]||0)+1}-${randomBytes(8).toString('hex')}`;
      documents.set(id,{...body,_rev:rev});return send(201,{ok:true,id:body._id,rev});
    }
    send(405,{});
  });
  const repository=new CouchRepository({url:couch.url,user:'test',password:'password'}); await repository.initialize();
  const api=await listen(createApp({repository,clock:()=>now,rateLimit:10000}));
  t.after(async()=>{await api.close();await couch.close();});
  return {url:api.url,documents,repository,couch,advance(ms){now+=ms;},get writes(){return contentWrites;},get security(){return security;}};
}
export async function request(f,path,token,method='GET',body,headers={}) {
  const response=await fetch(f.url+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,revision:response.headers.get('ETag'),data:await response.json().catch(()=>null),headers:response.headers};
}
export async function owner(f,name='Geheimer Wocheneinkauf') {
  const client=await browser(f.url).open(); const list=client.makeList(name);
  const now=new Date().toISOString();
  list.items.push({id:randomUUID(),kind:'item',text:'Hafermilch',checked:false,createdAt:now,updatedAt:now});
  await client.store.create(list); const share=await client.store.prepareShare(list.id,f.url);
  await client.sync(list.id);
  return {client,list,share};
}
export async function invitation(f,owner) {
  const P=owner.client.P, share=owner.share;
  const invite={remoteId:share.remoteId,invitationId:P.secret(),claimToken:P.secret(),wrapKey:P.secret(),requestId:P.secret()};
  const box=await P.invitationBox(share,invite.invitationId,invite.wrapKey);
  const result=await request(f,`/api/shares/${share.remoteId}/invitation`,share.ownerToken,'POST',{id:invite.invitationId,claimHash:await P.hash(invite.claimToken),box});
  if(result.status!==201)throw new Error(JSON.stringify(result));
  return {...invite,box};
}
export async function claim(f,invite,client) {
  const result=await client.transport.request(`/api/shares/${invite.remoteId}/claim`,invite.claimToken,'POST',{invitationId:invite.invitationId,requestId:invite.requestId});
  const packet=await client.P.decrypt(invite.wrapKey,client.P.invitationContext(invite.remoteId,invite.invitationId),result.data.box);
  const id=await client.store.installShare({id:randomUUID(),remoteId:packet.remoteId,origin:f.url,key:packet.key,memberToken:packet.memberToken,ownerToken:null,registered:true},null);
  return id;
}
export async function activePair(f) {
  const a=await owner(f); const b=await browser(f.url).open(); const invite=await invitation(f,a); const id=await claim(f,invite,b);
  await a.client.sync(a.list.id); await b.sync(id); return {a,b,id,invite};
}
