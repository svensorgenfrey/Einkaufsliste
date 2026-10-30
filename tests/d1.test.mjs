import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { D1Repository } from '../server/d1.mjs';
import { browser,registerTransport,owner,invitation,claim,request } from './helpers.mjs';

async function workerFixture(t) {
  const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
  const mf=new Miniflare({workers:[{config:{name:'shopping',compatibilityDate:'2026-05-15',manifest:{mainModule:'index.js',modulesRoot:'/',modules:{'index.js':{type:'esm',contents:source}}},env:{DB:{type:'d1',id:randomUUID()}}}}]});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.prepare(await readFile(new URL('../drizzle/0000_marvelous_reptil.sql',import.meta.url),'utf8')).run();
  const url=`https://worker-${randomUUID()}.test`,fetch=async(input,init)=>{
    const response=await mf.dispatchFetch(input,init),headers=new Headers(response.headers);
    // Sites/gzip can weaken ETag after the Worker has generated its response.
    const etag=headers.get('ETag');if(etag&&!etag.startsWith('W/'))headers.set('ETag','W/'+etag);
    return new Response(response.body,{status:response.status,headers});
  };
  registerTransport(url,fetch);t.after(()=>registerTransport(url,null));
  return {url,fetch,db};
}

test('real Worker/D1 runtime: atomic conditional create/update reject stale revisions',async t=>{
  const f=await workerFixture(t),repo=new D1Repository(f.db),id=randomUUID();
  const creates=await Promise.allSettled([repo.put({id,content:null}),repo.put({id,content:null})]);
  assert.equal(creates.filter(r=>r.status==='fulfilled').length,1);assert.equal(creates.find(r=>r.status==='rejected').reason.status,409);
  const old=await repo.get(id);
  const writes=await Promise.allSettled([repo.put({...old,accepted:true}),repo.put({...old,revoked:true})]);
  assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.find(r=>r.status==='rejected').reason.status,409);
  assert.notEqual((await repo.get(id))._rev,old._rev);
});

test('built artifact in real Worker/D1 runtime: QR gating, three browsers, conflicts, backup, revocation and static assets',async t=>{
  const f=await workerFixture(t);
  const health=await f.fetch(f.url+'/healthz');assert.deepEqual(await health.json(),{ok:true,storage:'d1'});
  for(const [path,type] of [['/','text/html'],['/style.css','text/css'],['/app.js','text/javascript']]){
    const response=await f.fetch(f.url+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),new RegExp(type));
  }
  assert.equal((await f.fetch(f.url+'/server/server.mjs')).status,404);
  const a=await owner(f),s=a.share,path=`/api/shares/${s.remoteId}`;
  let stored=JSON.parse((await f.db.prepare('SELECT document FROM shares WHERE id = ?').bind(s.remoteId).first()).document);
  assert.equal(stored.content,null);
  const inv=await invitation(f,a),b=await browser(f.url).open();
  assert.equal(await a.client.sync(a.list.id),'invitation');
  const bid=await claim(f,inv,b);assert.equal(await b.sync(bid),'waiting');
  const initial=await a.client.P.encrypt(s.key,a.client.P.contentContext(s.remoteId),(await a.client.store.syncState(a.list.id)).doc);
  assert.equal((await request(f,path+'/content',s.memberToken,'PUT',initial,{'If-None-Match':'*'})).status,409);
  assert.equal(await a.client.sync(a.list.id),'synced');assert.equal(await b.sync(bid),'synced');
  const c=await browser(f.url).open(),next=await invitation(f,a),cid=await claim(f,next,c);await c.sync(cid);
  const add={id:randomUUID(),kind:'item',text:'Kaffee aus Gerät C',checked:false,createdAt:'',updatedAt:''};
  await Promise.all([a.client.store.update(a.list.id,l=>{l.items[0].text='Neue Hafermilch';}),b.store.update(bid,l=>{l.items[0].checked=true;}),c.store.update(cid,l=>{l.items.push(add);l.items.reverse();})]);
  for(let n=0;n<3;n++)await Promise.all([a.client.sync(a.list.id),b.sync(bid),c.sync(cid)]);
  const docs=await Promise.all([a.client.store.syncState(a.list.id),b.store.syncState(bid),c.store.syncState(cid)]);
  assert.ok(docs.every(d=>a.client.P.canonical(d.doc)===a.client.P.canonical(docs[0].doc)));
  assert.equal(docs[0].doc.items[a.list.items[0].id].checked.value,true);assert.equal(docs[0].doc.items[a.list.items[0].id].content.value.text,'Neue Hafermilch');
  const restored=await browser(f.url).open(),backup=a.client.P.ownerBackup(s),rid=await restored.engine.restoreOwner(backup);
  assert.equal((await restored.store.share(rid)).ownerToken,s.ownerToken);
  assert.equal((await request(f,path,s.memberToken,'DELETE')).status,404);
  stored=(await f.db.prepare('SELECT document FROM shares WHERE id = ?').bind(s.remoteId).first()).document;
  for(const secret of [s.key,s.ownerToken,s.memberToken,a.list.name,'Hafermilch',add.text,inv.wrapKey,inv.claimToken])assert.ok(!stored.includes(secret));
  assert.equal((await request(f,path+'/content',b.P.secret())).status,404);
  const competing=await invitation(f,a),claimPath=`/api/shares/${s.remoteId}/claim`;
  const attempts=await Promise.all([request(f,claimPath,competing.claimToken,'POST',{invitationId:competing.invitationId,requestId:b.P.secret()}),request(f,claimPath,competing.claimToken,'POST',{invitationId:competing.invitationId,requestId:c.P.secret()})]);
  assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
  assert.equal((await request(f,path,s.ownerToken,'DELETE')).status,204);
  await assert.rejects(b.sync(bid),e=>e.status===410);
  await assert.rejects(restored.engine.restoreOwner(backup),e=>e.status===410);
  await a.client.store.detachShare(s);assert.equal((await a.client.store.snapshot()).lists.find(l=>l.id===a.list.id).items.length,2);
});
