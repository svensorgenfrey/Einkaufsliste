import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,request,owner,invitation,browser,claim,activePair,plain } from './helpers.mjs';

test('CouchDB adapter configures admin-only database; no plaintext or raw tokens reach storage',async t=>{
  const f=await fixture(t),a=await owner(f);await invitation(f,a);
  assert.deepEqual(f.security.members.roles,['_admin']);
  const doc=f.documents.get(a.share.remoteId),serialized=JSON.stringify(doc);
  assert.equal(doc.content,null);assert.equal(f.writes,0);
  for(const secret of [a.list.name,'Hafermilch',a.share.key,a.share.memberToken,a.share.ownerToken])assert.ok(!serialized.includes(secret));
});

test('first upload requires a real claim, owner authority and conditional write',async t=>{
  const f=await fixture(t),a=await owner(f),s=a.share,path=`/api/shares/${s.remoteId}/content`;
  const box=await a.client.P.encrypt(s.key,a.client.P.contentContext(s.remoteId),a.client.P.initial(a.list));
  assert.equal((await request(f,path,s.ownerToken,'PUT',box,{'If-None-Match':'*'})).status,409);
  const inv=await invitation(f,a);
  assert.equal((await request(f,path,s.ownerToken,'PUT',box,{'If-None-Match':'*'})).status,409);
  assert.equal((await request(f,path,s.memberToken,'GET')).status,202);
  const b=await browser(f.url).open(),id=await claim(f,inv,b);
  assert.equal(await b.sync(id),'waiting');
  assert.equal((await request(f,path,s.memberToken,'PUT',box,{'If-None-Match':'*'})).status,409);
  assert.equal((await request(f,path,s.ownerToken,'PUT',box)).status,428);
  assert.equal(await a.client.sync(a.list.id),'synced');assert.equal(await b.sync(id),'synced');
  const active=await request(f,path,s.memberToken);assert.equal(active.status,200);
  assert.equal((await request(f,path,s.memberToken,'PUT',box,{'If-Match':'"stale"'})).status,409);
});

test('expired, cancelled and replaced unclaimed invitations cannot activate contents',async t=>{
  const f=await fixture(t),a=await owner(f),s=a.share;
  const expired=await invitation(f,a);f.advance(600001);
  const b=await browser(f.url).open();await assert.rejects(claim(f,expired,b),e=>e.status===410);
  assert.equal(await a.client.sync(a.list.id),'invitation');assert.equal(f.writes,0);
  const cancelled=await invitation(f,a);
  await request(f,`/api/shares/${s.remoteId}/invitation`,s.ownerToken,'DELETE');
  await assert.rejects(claim(f,cancelled,b),e=>e.status===404);assert.equal(f.writes,0);
  const replaced=await invitation(f,a);await invitation(f,a);
  await assert.rejects(claim(f,replaced,b),e=>e.status===404);assert.equal(await a.client.sync(a.list.id),'invitation');assert.equal(f.writes,0);
});

test('claim is atomic, retryable after lost response, and never reset by a repeated create',async t=>{
  const f=await fixture(t),a=await owner(f),inv=await invitation(f,a),path=`/api/shares/${inv.remoteId}/claim`;
  const body={invitationId:inv.invitationId,requestId:inv.requestId};
  const results=await Promise.all([request(f,path,inv.claimToken,'POST',body),request(f,path,inv.claimToken,'POST',{...body,requestId:a.client.P.secret()})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  // A separate invitation makes the response-loss retry deterministic.
  const next=await invitation(f,a),nextBody={invitationId:next.invitationId,requestId:next.requestId};
  assert.equal((await request(f,path,next.claimToken,'POST',nextBody)).status,200);
  const again=await request(f,`/api/shares/${a.share.remoteId}/invitation`,a.share.ownerToken,'POST',{id:next.invitationId,claimHash:await a.client.P.hash(next.claimToken),box:next.box});assert.equal(again.status,201);
  f.advance(600001);
  assert.deepEqual((await request(f,path,next.claimToken,'POST',nextBody)).data.box,plain(next.box));
  assert.equal((await request(f,path,next.claimToken,'POST',{...nextBody,requestId:a.client.P.secret()})).status,409);
  assert.equal(await a.client.sync(a.list.id),'synced');
});

test('wrong tokens, member administration, origin mismatch and cache validators never bypass authorization',async t=>{
  const f=await fixture(t),{a}=await activePair(f),s=a.share,path=`/api/shares/${s.remoteId}`;
  const good=await request(f,path+'/content',s.memberToken);
  for(const token of [a.client.P.secret(),s.key])assert.equal((await request(f,path+'/content',token,'GET',undefined,{'If-None-Match':good.revision})).status,404);
  assert.equal((await request(f,path+'/invitation',s.memberToken)).status,404);
  assert.equal((await request(f,path,s.memberToken,'DELETE')).status,404);
  assert.equal((await request(f,path+'/content',s.memberToken,'GET',undefined,{Origin:'https://evil.test'})).status,403);
  assert.equal((await request(f,path+'/content',s.memberToken,'GET',undefined,{'If-None-Match':good.revision})).status,304);
  assert.equal((await request(f,'/server/server.mjs',s.ownerToken)).status,404);
  assert.match(good.headers.get('cache-control'),/no-store/);
});

test('limits reject oversized or unexpected payloads without storing plaintext',async t=>{
  const f=await fixture(t),a=await owner(f),s=a.share;
  assert.equal((await request(f,`/api/shares/${s.remoteId}/invitation`,s.ownerToken,'POST',{name:'secret'})).status,400);
  assert.equal((await request(f,`/api/shares/${s.remoteId}/content`,s.ownerToken,'PUT',{v:1,iv:'a'.repeat(16),ct:'a'.repeat(2*1024*1024)})).status,413);
  assert.equal(f.writes,0);
});

test('a valid claim remains retryable and can activate after a new QR replaces it',async t=>{
  const f=await fixture(t),a=await owner(f),first=await invitation(f,a),b=await browser(f.url).open();
  const record={key:'pendingClaim',value:{...first,box:undefined}};
  await b.store.preference(record.key,record.value);
  const body={invitationId:first.invitationId,requestId:first.requestId};
  assert.equal((await request(f,`/api/shares/${first.remoteId}/claim`,first.claimToken,'POST',body)).status,200);
  await invitation(f,a); // Does not revoke the already accepted person's receipt.
  b.store.database.close();const reopened=await browser(f.url,b.indexedDB).open();
  const stored=await reopened.store.read('preferences','pendingClaim');
  const id=await claim(f,stored.value,reopened);
  assert.equal(await reopened.sync(id),'waiting');assert.equal(f.writes,0);
  assert.equal(await a.client.sync(a.list.id),'synced');assert.equal(await reopened.sync(id),'synced');
});

test('proxy-weakened validators keep conditional revision protection without false conflicts',async t=>{
  const f=await fixture(t),{a}=await activePair(f),s=a.share,path=`/api/shares/${s.remoteId}/content`;
  const current=await request(f,path,s.memberToken);
  assert.equal(current.headers.get('X-Share-Revision'),current.revision);
  const updated=await request(f,path,s.memberToken,'PUT',current.data,{'If-Match':'W/'+current.revision});
  assert.equal(updated.status,200);assert.equal(updated.headers.get('X-Share-Revision'),updated.revision);
  assert.equal((await request(f,path,s.memberToken,'PUT',current.data,{'If-Match':'W/'+current.revision})).status,409);
});
