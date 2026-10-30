import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const controller=source.slice(source.indexOf('function stopSync()'),source.indexOf('function renderSyncStatus()'));
const events=source.slice(source.indexOf("window.addEventListener('online',"),source.indexOf('/** @returns {string} */\nfunction uuid'));

test('foreground controller debounces, aborts hidden/changed lists, resumes immediately and backs off failures',async()=>{
  const timers=new Map();let sequence=0,calls=0,lastSignal,finish;
  const document=Object.assign(new EventTarget(),{hidden:false});
  const window=Object.assign(new EventTarget(),{setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}});
  let fail=false;
  class ShareSync {
    async sync(id,signal){calls++;lastSignal=signal;if(fail)throw new TypeError('offline');return new Promise((resolve,reject)=>{finish=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}
  }
  const context=vm.createContext({window,document,navigator:{onLine:true},AbortController,TypeError,ShareSync,ShareError:class extends Error{},renderSyncStatus(){},refresh:async()=>{},transport:{},channel:null});
  vm.runInContext(`let selectedShare={id:'a',remoteId:'one'},state={ready:true,store:{async syncState(){return {};}}},syncTimer=0,syncAgain=false,syncRequest=null,syncTarget='',syncFailures=0,remoteStatus='';\n${controller}\n${events}\nglobalThis.api={scheduleSync,syncSelected,reconcileSync,setShare(value){selectedShare=value;}};`,context);
  const api=context.api;
  api.scheduleSync();api.scheduleSync();assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,300);
  const running=api.syncSelected();await new Promise(setImmediate);assert.equal(calls,1);assert.equal(lastSignal.aborted,false);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(lastSignal.aborted,true);await running;assert.equal(timers.size,0);
  api.scheduleSync();assert.equal(timers.size,0);assert.equal(calls,1);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal([...timers.values()][0].delay,0);
  timers.clear();const resumed=api.syncSelected();await new Promise(setImmediate);finish('synced');await resumed;assert.equal([...timers.values()][0].delay,3000);
  timers.clear();const changedDuringUpload=api.syncSelected();await new Promise(setImmediate);api.scheduleSync();assert.equal(timers.size,0);finish('synced');await changedDuringUpload;assert.equal([...timers.values()][0].delay,300);
  timers.clear();fail=true;await api.syncSelected();assert.equal([...timers.values()][0].delay,3000);timers.clear();await api.syncSelected();assert.equal([...timers.values()][0].delay,6000);
  for(let n=0;n<8;n++){timers.clear();await api.syncSelected();}assert.equal([...timers.values()][0].delay,60000);
  window.dispatchEvent(new Event('online'));assert.equal([...timers.values()][0].delay,0);
  fail=false;timers.clear();const previous=api.syncSelected();await new Promise(setImmediate);const old=lastSignal;
  api.setShare({id:'b',remoteId:'two'});api.reconcileSync();assert.equal(old.aborted,true);await previous;assert.equal([...timers.values()][0].delay,0);
  api.setShare(null);api.reconcileSync();assert.equal(timers.size,0);
});
