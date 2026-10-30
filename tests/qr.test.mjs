import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import jsQR from '../server/node_modules/jsqr/dist/jsQR.js';
import { browser } from './helpers.mjs';

test('the vendored generator produces a QR independently decoded to a fragment-only invitation',async()=>{
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const context=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('var qrcodegen;'),source.indexOf('// BEGIN SHARE PROTOCOL'))+'\nglobalThis.QR=qrcodegen;',context);
  const {P}=browser('https://einkauf.example');
  const data={v:1,remoteId:P.secret(),invitationId:P.secret(),claimToken:P.secret(),wrapKey:P.secret()};
  const url=new URL('https://einkauf.example/index.html');url.hash='einladung='+P.invitationFragment(data);
  const qr=context.QR.QrCode.encodeText(url.href,context.QR.QrCode.Ecc.MEDIUM),scale=5,size=(qr.size+8)*scale;
  const pixels=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const xx=Math.floor(x/scale)-4,yy=Math.floor(y/scale)-4;
    const color=xx>=0&&yy>=0&&xx<qr.size&&yy<qr.size&&qr.getModule(xx,yy)?0:255;
    pixels.set([color,color,color,255],(y*size+x)*4);
  }
  assert.equal(jsQR(pixels,size,size)?.data,url.href);
  assert.equal(url.search,'');assert.equal(url.pathname,'/index.html');
  for(const secret of [data.claimToken,data.wrapKey])assert.ok(!url.href.split('#')[0].includes(secret));
  const decoded=P.claimFromFragment(url.hash.slice(11));
  for(const field of ['remoteId','invitationId','claimToken','wrapKey'])assert.equal(decoded[field],data[field]);
  assert.equal(url.hash.length,188);
});
