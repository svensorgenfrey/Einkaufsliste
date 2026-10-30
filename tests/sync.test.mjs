import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture,owner,invitation,browser,claim,activePair,request,plain } from './helpers.mjs';

const textItems=snapshot=>snapshot.lists.flatMap(l=>l.items.map(i=>i.text));
const item=text=>({id:randomUUID(),kind:'item',text,checked:false,createdAt:'',updatedAt:''});

test('v1 IndexedDB upgrade preserves private lists and preferences without creating shares',async()=>{
  const a=browser('https://example.test');const legacy=a.makeList('Meine alte Liste');legacy.items=[item('Kartoffeln')];legacy.items[0].checked=true;
  const request=a.indexedDB.open('einkaufsliste-local',1);
  await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('lists',{keyPath:'id'}).put(legacy);const p=db.createObjectStore('preferences',{keyPath:'key'});p.put({key:'initialized',value:true});p.put({key:'large',value:true});p.put({key:'activeListId',value:legacy.id});};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
  await a.open();const snapshot=await a.store.snapshot();assert.equal(snapshot.lists.length,1);assert.deepEqual(plain(snapshot.lists[0]),plain(legacy));assert.equal(snapshot.shares.length,0);assert.equal(snapshot.syncStates.length,0);assert.ok(snapshot.preferences.some(p=>p.key==='large'&&p.value));
});

test('three independent browsers converge after offline edits, deletes, sorting and simultaneous fields',async t=>{
  const f=await fixture(t),{a,b,id}=await activePair(f),c=await browser(f.url).open();
  const next=await invitation(f,a),cid=await claim(f,next,c);await c.sync(cid);
  const originalId=a.list.items[0].id;
  await Promise.all([
    a.client.store.update(a.list.id,l=>{l.name='Gemeinsam';l.items[0].text='Mandelmilch';l.items.push(item('Äpfel'));}),
    b.store.update(id,l=>{l.items[0].checked=true;l.items.push(item('Brot'));}),
    c.store.update(cid,l=>{l.items.push(item('Kaffee'));l.items.reverse();})
  ]);
  // These are durable edits, not merely optimistic UI state.
  assert.equal((await b.store.syncState(id)).dirty,true);
  const reopened=await browser(f.url,b.indexedDB).open();assert.ok(textItems(await reopened.store.snapshot()).includes('Brot'));
  await Promise.all([a.client.sync(a.list.id),b.sync(id),c.sync(cid)]);
  for(let n=0;n<2;n++)await Promise.all([a.client.sync(a.list.id),b.sync(id),c.sync(cid)]);
  const states=await Promise.all([a.client.store.syncState(a.list.id),b.store.syncState(id),c.store.syncState(cid)]);
  assert.ok(states.every(s=>a.client.P.canonical(s.doc)===a.client.P.canonical(states[0].doc)));
  const shared=(await b.store.snapshot()).lists.find(l=>l.id===id);assert.equal(shared.name,'Gemeinsam');assert.equal(shared.items.length,4);
  assert.equal(shared.items.find(i=>i.id===originalId).text,'Mandelmilch');assert.equal(shared.items.find(i=>i.id===originalId).checked,true);
  await a.client.store.update(a.list.id,l=>{l.items=l.items.filter(i=>i.id!==originalId);l.items.reverse();});
  await c.store.update(cid,l=>{l.items.find(i=>i.id===originalId).text='Veraltete Offline-Änderung';});
  await Promise.all([a.client.sync(a.list.id),c.sync(cid)]);await b.sync(id);await c.sync(cid);await a.client.sync(a.list.id);
  assert.ok(!(await c.store.snapshot()).lists.find(l=>l.id===cid).items.some(i=>i.id===originalId));
  reopened.store.database.close();
});

test('network failures retain durable edits; reconnect retries without rewriting an unchanged ciphertext',async t=>{
  const f=await fixture(t),{a,b,id}=await activePair(f);
  await b.store.update(id,l=>l.items.push(item('Offline-Kartoffeln')));
  const offline=new b.ShareSync(b.store,new b.ShareTransport('http://127.0.0.1:1'));
  // Origin validation also prevents accidentally transmitting capabilities elsewhere.
  await assert.rejects(offline.sync(id,new AbortController().signal));assert.equal((await b.store.syncState(id)).dirty,true);
  const real=b.transport.request.bind(b.transport);b.transport.request=async()=>{throw new TypeError('offline');};
  await assert.rejects(b.sync(id));assert.ok(textItems(await b.store.snapshot()).includes('Offline-Kartoffeln'));
  b.transport.request=real;await b.sync(id);assert.equal((await b.store.syncState(id)).dirty,false);await a.client.sync(a.list.id);
  assert.ok(textItems(await a.client.store.snapshot()).includes('Offline-Kartoffeln'));
  const writes=f.writes;await b.sync(id);await a.client.sync(a.list.id);assert.equal(f.writes,writes);
});

test('edits made during PUT survive the acknowledgment and are sent in the next pass',async t=>{
  const f=await fixture(t),{a,b,id}=await activePair(f);
  await b.store.update(id,l=>l.items.push(item('Vor Anfrage')));
  const real=b.transport.request.bind(b.transport);let changed=false;
  b.transport.request=async(...args)=>{
    if(args[2]==='PUT'&&!changed){changed=true;await b.store.update(id,l=>l.items.push(item('Während Anfrage')));}
    return real(...args);
  };
  assert.equal(await b.sync(id),'pending');assert.equal((await b.store.syncState(id)).dirty,true);
  await b.sync(id);await a.client.sync(a.list.id);assert.ok(textItems(await a.client.store.snapshot()).includes('Während Anfrage'));assert.equal((await b.store.syncState(id)).dirty,false);
});

test('aborting a sync leaves edits pending and a later pass succeeds',async t=>{
  const f=await fixture(t),{b,id}=await activePair(f);await b.store.update(id,l=>l.items.push(item('Bleibt lokal')));
  const controller=new AbortController();controller.abort();await assert.rejects(b.engine.sync(id,controller.signal));assert.equal((await b.store.syncState(id)).dirty,true);
  assert.equal(await b.sync(id),'synced');
});

test('owner backup restores server state, merges existing local edits, rejects foreign origins and excludes pending changes',async t=>{
  const f=await fixture(t),{a}=await activePair(f),P=a.client.P;
  await a.client.store.update(a.list.id,l=>l.items.push(item('Nur lokal, noch ungesendet')));
  const exported=plain(P.ownerBackup(a.share));assert.ok(!JSON.stringify(exported).includes('Nur lokal'));
  assert.throws(()=>P.parseBackup(exported,'https://different.test'));
  const restored=await browser(f.url).open();
  await assert.rejects(restored.engine.restoreOwner({...exported,origin:'https://different.test'}));
  await assert.rejects(restored.engine.restoreOwner({...exported,ownerToken:exported.memberToken}),e=>e.status===404);
  await assert.rejects(restored.engine.restoreOwner({...exported,key:P.secret()}));
  assert.equal((await restored.store.snapshot()).shares.length,0);
  const id=await restored.engine.restoreOwner(exported);
  assert.equal((await restored.store.share(id)).ownerToken,exported.ownerToken);
  assert.ok(!textItems(await restored.store.snapshot()).includes('Nur lokal, noch ungesendet'));
  await restored.store.update(id,l=>l.items.push(item('Vor erneutem Import')));
  const duplicate=await restored.engine.restoreOwner(exported);assert.equal(duplicate,id);assert.ok(textItems(await restored.store.snapshot()).includes('Vor erneutem Import'));
  assert.equal((await restored.store.snapshot()).shares.length,1);
});

test('ending sharing revokes old invites/tokens; fresh share uses fresh keys and preserves local owner data',async t=>{
  const f=await fixture(t),{a,b,id}=await activePair(f),old=a.share,inv=await invitation(f,a);
  assert.equal((await request(f,`/api/shares/${old.remoteId}`,old.ownerToken,'DELETE')).status,204);
  await a.client.store.detachShare(old);
  const saved=(await a.client.store.snapshot()).lists.find(l=>l.id===a.list.id);assert.equal(saved.name,a.list.name);
  await assert.rejects(b.sync(id),e=>e.status===410);
  const third=await browser(f.url).open();await assert.rejects(claim(f,inv,third),e=>e.status===404||e.status===410);
  const fresh=await a.client.store.prepareShare(a.list.id,f.url);
  for(const field of ['remoteId','key','ownerToken','memberToken'])assert.notEqual(fresh[field],old[field]);
  await a.client.sync(a.list.id);
  assert.equal(f.documents.get(fresh.remoteId).content,null);
  assert.equal((await request(f,`/api/shares/${old.remoteId}/content`,old.memberToken)).status,410);
  assert.equal((await request(f,`/api/shares/${fresh.remoteId}/content`,old.memberToken)).status,404);
  assert.equal((await request(f,'/api/shares',old.ownerToken,'POST',{id:old.remoteId,memberHash:await a.client.P.hash(old.memberToken)})).status,410);
});

test('participant deletion is local, while owner administrative failure cannot discard data or credentials',async t=>{
  const f=await fixture(t),{a,b,id}=await activePair(f),path=`/api/shares/${a.share.remoteId}`;
  assert.equal((await request(f,path,b.P.secret(),'DELETE')).status,404);assert.ok(await a.client.store.share(a.list.id));
  await b.store.remove(id);assert.equal(await b.store.share(id),undefined);assert.equal((await request(f,path+'/content',a.share.ownerToken)).status,200);
});

test('two tabs on the same IndexedDB commit concurrent local edits and metadata atomically',async t=>{
  const f=await fixture(t),{a}=await activePair(f);
  const tab=await browser(f.url,a.client.indexedDB).open(),id=a.list.id;
  await Promise.all([a.client.store.update(id,l=>{l.items[0].text='Umbenannt';}),tab.store.update(id,l=>{l.items[0].checked=true;})]);
  const record=await tab.store.syncState(id),snapshot=await tab.store.snapshot(),list=snapshot.lists.find(l=>l.id===id);
  assert.equal(list.items[0].text,'Umbenannt');assert.equal(list.items[0].checked,true);assert.equal(record.doc.items[list.items[0].id].checked.value,true);assert.equal(record.doc.items[list.items[0].id].content.value.text,'Umbenannt');assert.equal(record.dirty,true);
  tab.store.database.close();
});

test('failed static-host registration can resume on the configured API without losing data or secrets',async()=>{
  const client=await browser('https://api.example.test').open(),list=client.makeList('Meine lokale Liste');list.items=[item('Bleibt erhalten')];list.items[0].checked=true;await client.store.create(list);
  const previous=await client.store.prepareShare(list.id,'https://sorgenfrey.de'),before=await client.store.syncState(list.id);
  const pending={id:list.id,invitationId:client.P.secret(),claimToken:client.P.secret(),wrapKey:client.P.secret(),box:null,expiresAt:null};pending.box=await client.P.invitationBox(previous,pending.invitationId,pending.wrapKey);await client.store.saveInvitation(pending);
  const migrated=await client.store.prepareShare(list.id,'https://api.example.test');assert.equal(migrated.origin,'https://api.example.test');
  for(const field of ['id','remoteId','key','ownerToken','memberToken'])assert.equal(migrated[field],previous[field]);
  assert.equal(client.P.canonical((await client.store.syncState(list.id)).doc),client.P.canonical(before.doc));
  assert.deepEqual(plain(await client.store.invitation(list.id)),plain(pending));
  const stored=(await client.store.snapshot()).lists.find(l=>l.id===list.id);assert.equal(stored.items[0].text,'Bleibt erhalten');assert.equal(stored.items[0].checked,true);
  await client.store.markRegistered(migrated);
  assert.equal((await client.store.prepareShare(list.id,'https://different-api.test')).origin,'https://api.example.test');
});
