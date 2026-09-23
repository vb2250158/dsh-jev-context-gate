import test from 'node:test';
import assert from 'node:assert/strict';
import { modeForModel } from '../src/mode.mjs';
import { testChoice } from '../src/choice-test.mjs';

const settings = { provider: 'example', model: 'ordinary-model' };
const createMessage = text => ({ content: [{ type: 'text', text }] });
const chunks = text => async function* () {
  yield { type: 'text-delta', text };
  yield { type: 'finish', reason: { kind: 'stop' } };
}();
const input = { settings, state: '退款请求', question: '应如何处理？', options: ['退款', '解释', '其他'], createMessage };

test('model IDs select mode without a manual switch', () => {
  assert.equal(modeForModel('jev-latest'), 'jev-native');
  assert.equal(modeForModel('jev-1.13.0'), 'jev-native');
  assert.equal(modeForModel('other-jev'), 'llm-json');
  assert.equal(modeForModel('ordinary-model'), 'llm-json');
  assert.equal(modeForModel(''), 'unconfigured');
});

test('ordinary model choice test reports every option and distribution concentration', async () => {
  let request;
  const result = await testChoice({ ...input, stream: options => {
    request = options;
    return chunks('{"probabilities":{"option-1":0.8,"option-2":0.15,"option-3":0.05}}');
  } });
  assert.equal(request.provider, settings.provider);
  assert.equal(request.model, settings.model);
  assert.equal(result.mode, 'llm-json');
  assert.equal(result.selected, 'option-1');
  assert.equal(result.options.length, 3);
  assert.equal(result.options[0].label, '退款');
  assert.equal(result.options[0].probability, 0.8);
  assert.ok(result.confidence > 0 && result.confidence < 1);
  assert.equal(result.confidenceKind, 'distribution-concentration');
});

test('flat and peaked distributions produce distinct concentration values', async () => {
  const flat = await testChoice({ ...input, options: ['是', '否'], stream: () => chunks('{"probabilities":{"option-1":0.5,"option-2":0.5}}') });
  const peak = await testChoice({ ...input, options: ['是', '否'], stream: () => chunks('{"probabilities":{"option-1":1,"option-2":0}}') });
  assert.equal(flat.confidence, 0);
  assert.equal(peak.confidence, 1);
});

test('invalid probabilities and tool calls fail instead of displaying invented results', async () => {
  await assert.rejects(() => testChoice({ ...input, stream: () => chunks('{"probabilities":{"option-1":0.9,"option-2":0.9,"option-3":0.9}}') }), /之和/);
  await assert.rejects(() => testChoice({ ...input, stream: () => chunks('{"probabilities":{"option-1":1}}') }), /格式/);
  const toolCall = async function* () { yield { type: 'tool-call-delta' }; }();
  await assert.rejects(() => testChoice({ ...input, stream: () => toolCall }), /不得调用工具/);
});

test('Jev model never enters the ordinary JSON simulation', async () => {
  await assert.rejects(() => testChoice({ ...input, settings: { ...settings, model: 'jev-latest' }, stream: () => { throw new Error('must not call'); } }), /原生结构化调用/);
});
