import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/judge.mjs';
import { defaultRules } from '../src/settings.mjs';

const settings = { provider: 'test', model: 'judge', maxContextCharacters: 2000, rules: [defaultRules[0]] };
const chunks = text => async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } } }();
const createMessage = text => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });

test('ordinary model sees explicit title, options and selected action only', async () => {
  let request;
  const result = await judge({ settings, phase: 'before', text: '截图显示错误',
    stream: options => { request = options; return chunks('{"investigate-before-claim":{"probabilities":{"yes":0.9,"no":0.1}}}'); }, createMessage });
  const input = JSON.parse(request.messages[0].content[0].text);
  assert.equal(input.items[0].title, defaultRules[0].question);
  assert.equal(input.items[0].options.yes, defaultRules[0].options[0].label);
  assert.match(result.context, /源码、配置、日志/);
  assert.equal(result.decisions[0].optionId, 'yes');
});

test('invalid verdict and tool calls fail closed', async () => {
  await assert.rejects(() => judge({ settings, phase: 'before', text: 'x', stream: () => chunks('{"investigate-before-claim":{"probabilities":{"yes":2,"no":0}}}'), createMessage }));
  const stream = async function* () { yield { type: 'tool-call-delta', index: 0, id: 'x', argumentsDelta: '{}' }; yield { type: 'finish', reason: { kind: 'stop' } } }();
  await assert.rejects(() => judge({ settings, phase: 'before', text: 'x', stream: () => stream, createMessage }));
});

test('Jev model IDs select native mode without a legacy switch', async () => {
  await assert.rejects(() => judge({ settings: { ...settings, model: 'jev-latest' }, phase: 'before', text: 'x', stream: () => chunks('{}'), createMessage }), /Native Jev/);
});
