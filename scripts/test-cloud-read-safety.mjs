import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compile = async (entryPoints, extra = {}) => {
  const result = await build({entryPoints,bundle:true,write:false,format:'esm',platform:'node',...extra});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { cloudRead } = await compile(['src/data/cloudRead.ts']);
assert.equal(await cloudRead(Promise.resolve(null),20),null);
assert.deepEqual(await cloudRead(Promise.resolve({items:[]}),20),{items:[]});
await assert.rejects(cloudRead(Promise.reject(new Error('permission denied')),20),/permission denied/);
let finish;
let received = false;
await assert.rejects(cloudRead(new Promise(resolve=>{finish=resolve;}),5).then(()=>{received=true;}),/读取超时/);
finish({items:[]});
await Promise.resolve();
assert.equal(received,false,'a late response must not enable the success path after timeout');

// Exercise actual auth storage with a full Safari localStorage, not a rewritten copy.
const cache = new Map([
  ['seedream-canvas-data/old-scope','old canvas'],
  ['seedream-generated-images/old-scope','old images'],
  ['seedream-app-storage',JSON.stringify({state:{templates:[]}})],
  ['auth-test','old session'],
]);
const session = new Map();
let quota = false;
const storage = values => ({
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>{if(values===cache&&quota)throw new DOMException('The quota has been exceeded.','QuotaExceededError');values.set(key,value);},
  removeItem:key=>values.delete(key),
  key:index=>[...values.keys()][index],
  get length(){return values.size;},
});
globalThis.window={localStorage:storage(cache),sessionStorage:storage(session)};
const {supabase}=await compile(['src/data/supabase.ts'],{
  define:{'import.meta.env.VITE_SUPABASE_URL':'"https://test.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"test-key"'},
  plugins:[{name:'fake-client',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'client',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const createClient=(_url,_key,options)=>options;'}));}}],
});
assert.equal(cache.get('seedream-canvas-data/old-scope'),'old canvas');
assert.equal(cache.get('seedream-generated-images/old-scope'),'old images');
quota=true;
supabase.auth.storage.setItem('auth-test','new session');
assert.equal(supabase.auth.storage.getItem('auth-test'),'new session');
assert.equal(cache.get('seedream-canvas-data/old-scope'),'old canvas');
assert.ok(cache.has('seedream-app-storage'));
quota=false;
supabase.auth.storage.setItem('auth-test','persistent session');
assert.equal(session.has('auth-test'),false);
assert.equal(supabase.auth.storage.getItem('auth-test'),'persistent session');
console.log('PASS cloud read timeout/rejection/late response and quota-safe auth cache preservation');
