import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createTestHandler } from '../src/test-route.mjs';

function request(body, origin = 'http://127.0.0.1:3180') {
  const stream = Readable.from([JSON.stringify(body)]);
  stream.method = 'POST';
  stream.headers = { origin, host: '127.0.0.1:3180', 'content-type': 'application/json' };
  return stream;
}
function response() {
  return {
    status: 0, body: '',
    writeHead(status) { this.status = status; },
    end(body) { this.body = body; },
  };
}

test('same-origin test route returns the actual result from the model runner', async () => {
  let received;
  const handler = createTestHandler(async input => { received = input; return { selected: 'option-2' }; });
  const res = response();
  await handler(request({ question: '哪项？', options: ['甲', '乙'] }), res);
  assert.deepEqual(received, { question: '哪项？', options: ['甲', '乙'] });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, value: { selected: 'option-2' } });
});

test('cross-origin requests never reach the model runner', async () => {
  const handler = createTestHandler(() => { throw new Error('must not call'); });
  const res = response();
  await handler(request({}, 'https://other.example'), res);
  assert.equal(JSON.parse(res.body).ok, false);
  assert.match(JSON.parse(res.body).error, /同源/);
});
