import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMutation, readBody, rpcFor, databaseError } from '../lib/api-core.mjs';
const origin='https://carerelay-sand.vercel.app';
const id='11111111-1111-4111-8111-111111111111';
test('mutations require the exact trusted origin and JSON',()=>{
  assert.doesNotThrow(()=>validateMutation({headers:{origin,'content-type':'application/json'}},origin));
  for(const foreign of [undefined,'https://attacker.example','https://carerelay-sand.vercel.app.attacker.example']) assert.throws(()=>validateMutation({headers:{origin:foreign,'content-type':'application/json'}},origin),{status:403});
  assert.throws(()=>validateMutation({headers:{origin,'content-type':'text/plain'}},origin),{status:415});
});
test('body validation rejects arrays, malformed JSON and oversized requests',async()=>{
  await assert.rejects(()=>readBody({body:'not JSON'}),{status:400});
  await assert.rejects(()=>readBody({body:[]}),{status:400});
  await assert.rejects(()=>readBody({body:{x:'a'.repeat(9000)}}),{status:413});
  assert.deepEqual(await readBody({body:'{"action":"join"}'}),{action:'join'});
});
test('report mapping ignores a spoofed actor and requires an idempotency key',()=>{
  const [rpc,args]=rpcFor({action:'report',circle:id,dose:id,outcome:'uncertain',requestId:id,actor:'elder'});
  assert.equal(rpc,'care_report');assert.equal(args.p_outcome,'uncertain');assert.equal('actor' in args,false);
  assert.throws(()=>rpcFor({action:'report',circle:id,dose:id,outcome:'taken'}),{status:400});
});
test('clients cannot select arbitrary RPCs or grant the elder role',()=>{
  assert.throws(()=>rpcFor({action:'care_private.log_event',circle:id}),{status:400});
  assert.throws(()=>rpcFor({action:'invite',circle:id,role:'elder'}),{status:400});
  assert.throws(()=>rpcFor({action:'add-dose',circle:id,label:'A',scheduled:'not-a-date'}),{status:400});
});
test('database errors expose safe access and conflict responses',()=>{
  assert.equal(databaseError({code:'42501',message:'private information'}).status,403);
  assert.doesNotMatch(databaseError({code:'42501',message:'private information'}).message,/private information/);
  assert.equal(databaseError({code:'23505'}).status,409);
  assert.equal(databaseError({code:'XX000',message:'secret'}).status,500);
});
