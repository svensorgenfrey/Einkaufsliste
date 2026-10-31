import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { browser,plain } from './helpers.mjs';
const {P,makeList}=browser('https://example.test');
const item=(text)=>({id:randomUUID(),kind:'item',text,checked:false,createdAt:'',updatedAt:''});

test('AES-256-GCM: new IV, wrong key, tampering and AAD context fail closed',async()=>{
  const key=P.secret(),context=P.contentContext(P.secret()),doc={name:'Geheim',items:['Brot']};
  const a=await P.encrypt(key,context,doc),b=await P.encrypt(key,context,doc);
  assert.notEqual(a.iv,b.iv);assert.equal(P.decode(a.iv).length,12);assert.deepEqual(plain(await P.decrypt(key,context,a)),doc);
  await assert.rejects(P.decrypt(P.secret(),context,a));
  await assert.rejects(P.decrypt(key,context+'other',a));
  const bytes=P.decode(a.ct);bytes[0]^=1;
  await assert.rejects(P.decrypt(key,context,{...a,ct:P.encode(bytes)}));
  await assert.rejects(P.decrypt(key,context,{...a,v:2}));
});

test('independent fields, additions, delete tombstones and order converge across three replicas',()=>{
  const base=makeList('Start');base.items=[item('Milch'),item('Brot'),item('Kaffee')];const initial=P.initial(base);
  const x=structuredClone(base),y=structuredClone(base),z=structuredClone(base);
  x.name='Neu';x.items[0].text='Hafermilch';x.items.push(item('Äpfel'));x.items.reverse();
  y.items[0].checked=true;y.items.splice(1,1);y.items.push(item('Birnen'));
  z.items[1].text='Altes Offline-Brot';z.items.push(item('Tee'));z.items.reverse();
  const a=P.edit(initial,x),b=P.edit(initial,y),c=P.edit(initial,z);
  const left=P.merge(P.merge(a,b),c),right=P.merge(a,P.merge(c,b));
  assert.equal(P.canonical(left),P.canonical(right));
  assert.equal(P.canonical(left),P.canonical(P.merge(left,left)));
  const visible=P.project(left,base);assert.equal(visible.name,'Neu');
  assert.equal(visible.items.find(i=>i.id===base.items[0].id).text,'Hafermilch');
  assert.equal(visible.items.find(i=>i.id===base.items[0].id).checked,true);
  assert.ok(!visible.items.some(i=>i.id===base.items[1].id));assert.equal(visible.items.length,5);
  assert.equal(P.project(P.merge(left,initial),base).items.length,5);
  const next=P.edit(left,{...visible,name:'Noch neuer'});assert.equal(next.clock,left.clock+1);
  assert.deepEqual(plain(P.validate(left)),plain(left));
});

test('content and kind form one register; equal-clock conflicts have a stable random tie break',()=>{
  const base=makeList('Liste');base.items=[item('Milch')];const initial=P.initial(base);
  const a=structuredClone(base),b=structuredClone(base);a.items[0].kind='divider';a.items[0].text='';b.items[0].text='Hafermilch';
  const x=P.edit(initial,a),y=P.edit(initial,b),xy=P.merge(x,y),yx=P.merge(y,x);
  assert.equal(P.canonical(xy),P.canonical(yx));
  const content=P.project(xy,base).items[0];assert.ok((content.kind==='divider'&&content.text==='')||(content.kind==='item'&&content.text==='Hafermilch'));
  assert.equal(x.clock,y.clock);
});

test('decrypted malformed, oversized or prototype-shaped documents are rejected',()=>{
  const good=P.initial(makeList('Liste'));
  for(const doc of [{...good,v:2},{...good,clock:Infinity},{...good,name:{...good.name,value:'x'.repeat(101)}},{...good,items:JSON.parse('{"__proto__":{}}')},{...good,order:{...good.order,value:['constructor']}}])assert.throws(()=>P.validate(doc));
});

test('reopening the same QR after response loss reuses the stored claim request ID',()=>{
  const data={remoteId:P.secret(),invitationId:P.secret(),claimToken:P.secret(),wrapKey:P.secret()};
  const fragment=P.invitationFragment(data),first=P.claimFromFragment(fragment);
  assert.equal(P.claimFromFragment(fragment,plain(first)).requestId,first.requestId);
  assert.notEqual(P.claimFromFragment(P.invitationFragment({...data,invitationId:P.secret()}),plain(first)).requestId,first.requestId);
  assert.notEqual(P.claimFromFragment(fragment,{...plain(first),requestId:'invalid'}).requestId,first.requestId);
  assert.throws(()=>P.claimFromFragment('2.'+fragment.slice(2)));
});

test('the actual invitation packaging function never includes the owner token',async()=>{
  const share={id:randomUUID(),remoteId:P.secret(),origin:'https://example.test',key:P.secret(),memberToken:P.secret(),ownerToken:P.secret(),registered:true};
  const invitationId=P.secret(),wrapKey=P.secret();
  const packet=await P.decrypt(wrapKey,P.invitationContext(share.remoteId,invitationId),await P.invitationBox(share,invitationId,wrapKey));
  assert.deepEqual(Object.keys(packet).sort(),['key','memberToken','remoteId','v']);
  assert.equal(packet.key,share.key);assert.equal(packet.memberToken,share.memberToken);assert.ok(!JSON.stringify(packet).includes(share.ownerToken));
});

test('transport uses the stable revision header and normalizes proxy-weakened legacy ETags',async()=>{
  for(const headers of [{'ETag':'W/"4-version"','X-Share-Revision':'"4-version"'},{'ETag':'W/"4-version"'}]){
    const client=browser('https://example.test',undefined,async()=>new Response('{}',{headers}));
    const result=await client.transport.request('/api/shares/test/content',P.secret());
    assert.equal(result.revision,'"4-version"');
  }
});

test('external static frontend addresses the configured API without sending its cookies',async()=>{
  let received;
  const client=browser('https://api.example.test',undefined,async(url,options)=>{received={url:String(url),...options};return new Response('{}');});
  const transport=new client.ShareTransport('https://api.example.test','https://frontend.example.test');
  await transport.request('/api/shares',P.secret(),'POST',{id:P.secret()});
  assert.equal(received.url,'https://api.example.test/api/shares');assert.equal(received.credentials,'omit');assert.equal(received.referrerPolicy,'no-referrer');
});

test('HTML from a static server is rejected before registration can be acknowledged',async()=>{
  const client=browser('https://example.test',undefined,async()=>new Response('<html>statische Seite</html>',{headers:{'Content-Type':'text/html'}}));
  await assert.rejects(client.transport.request('/api/shares',P.secret(),'POST',{}),e=>e.status===502&&e.message.includes('keine Einkaufslisten-API'));
});
