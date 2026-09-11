import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './sds-domain-worker.mjs';
const env = { TIMECLOCK_ORIGIN_KEY: 'synthetic-origin', TIMECLOCK_EMAIL_RELAY_KEY: 'synthetic-relay' };
test('Owner Relations uses bounded routes, preserving TimeClock and root redirect', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async request => { calls.push(request); return new Response('fixture'); };
  try {
    for (const path of ['/owner-relations','/owner-relations/login','/api/owner-relations','/api/owner-relations/statements','/admin','/api/admin/me','/_next/static/example.js']) {
      assert.equal((await worker.fetch(new Request('https://sdsoperations.com'+path),env)).status,200,path);
      assert.equal(new URL(calls.at(-1).url).origin,'https://timeclock.whichmore.com');
    }
    for (const path of ['/owner-relations-evil','/api/owner-relations-evil','/api/employees','/anything']) assert.equal((await worker.fetch(new Request('https://sdsoperations.com'+path),env)).status,404,path);
    assert.equal((await worker.fetch(new Request('https://sdsoperations.com/'),env)).headers.get('location'),'https://sdsoperations.com/admin/login');
    assert.equal((await worker.fetch(new Request('https://sdsoperations.com/api/owner-relations/auth/login',{method:'POST',headers:{origin:'https://evil.example'}}),env)).status,403);
  } finally { globalThis.fetch = original; }
});
function relay(body, key = 'synthetic-relay') { return new Request('https://sdsoperations.com/_account-email',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({email:'owner@example.test',token:'a'.repeat(43),id:'12345678-1234-1234-1234-123456789abc',invitation:true,...body})}); }
test('email application is fixed, backward compatible and fail closed', async () => {
  const sent = [];
  const mocked = {...env,EMAIL:{send:async message => { sent.push(message); return {messageId:'synthetic'}; }}};
  assert.equal((await worker.fetch(relay({application:'owner-relations'}),mocked)).status,200);
  assert.match(sent[0].subject,/Owner Relations/);
  assert.match(sent[0].text,/https:\/\/sdsoperations.com\/owner-relations\/set-password#token=/);
  assert.doesNotMatch(sent[0].text,/full TimeClock administration/);
  assert.equal((await worker.fetch(relay({}),mocked)).status,200);
  assert.match(sent[1].text,/\/admin\/set-password#token=/);
  assert.equal((await worker.fetch(relay({application:'unknown'}),mocked)).status,400);
  assert.equal((await worker.fetch(relay({application:'owner-relations'},'wrong'),mocked)).status,403);
  assert.equal(sent.length,2);
  assert.equal((await worker.fetch(relay({application:'owner-relations',invitation:false}),mocked)).status,200);
  assert.match(sent[2].subject,/Reset.*Owner Relations/);
  assert.match(sent[2].text,/30 minutes/);
});
