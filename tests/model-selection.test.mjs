import assert from 'node:assert/strict';
import test from 'node:test';
import { modelChoices, selectionPatch } from '../src/model-selection.mjs';
import { SettingsSchema } from '../src/settings.mjs';
import { modeForModel } from '../src/mode.mjs';
import { testChoice } from '../src/choice-test.mjs';
import { composeGroupMessage } from '../src/tool-automation.mjs';

test('one catalog puts native probabilities first, labels them and keeps ordinary providers and model identities', () => {
  const choices = modelChoices({ groups: [
    { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
    { id: 'openrouter', name: 'OpenRouter', models: [{ id: 'typesafe/jev-1.13', name: 'Jev 1.13' }, { id: 'ordinary', name: 'Ordinary' }] },
  ] });
  assert.deepEqual(choices.map(({ provider, model, native, label }) => ({ provider, model, native, label })), [
    { provider: 'openrouter', model: 'typesafe/jev-1.13', native: true, label: 'OpenRouter · Jev 1.13' },
    { provider: 'workbuddy', model: 'deepseek', native: false, label: 'WorkBuddy · DeepSeek · 兼容模式' },
    { provider: 'openrouter', model: 'ordinary', native: false, label: 'OpenRouter · Ordinary · 兼容模式' },
  ]);
  assert.equal(modelChoices(undefined)[0].provider, 'openrouter');
  assert.equal(modeForModel('typesafe/jev-1.13', 'unrelated'), 'llm-json');
});

test('legacy switch decodes into the same model pair and preserves rules, credential settings and ordinary message generation', () => {
  const migrated = SettingsSchema({ provider: 'workbuddy', model: 'deepseek', decisionApi: { enabled: true } });
  assert.equal(migrated.provider, 'openrouter');
  assert.equal(migrated.model, 'typesafe/jev-1.13');
  assert.equal(migrated.decisionApi.enabled, false);
  assert.deepEqual(migrated.messageModel, { provider: 'workbuddy', model: 'deepseek' });
  assert.deepEqual(SettingsSchema(migrated), migrated);
});

test('switching from native to ordinary calls the ordinary provider and switching back retains text generation', async () => {
  const native = SettingsSchema({ provider: 'workbuddy', model: 'deepseek', decisionApi: { enabled: true } });
  const ordinary = SettingsSchema({ ...native, ...selectionPatch(native, { provider: 'example', model: 'ordinary' }) });
  let request;
  const result = await testChoice({ settings: ordinary, state: 'fixture', question: 'Which?', options: ['A', 'B'], createMessage: text => text,
    stream: value => { request = value; return (async function* () { yield { type: 'text-delta', text: '{"probabilities":{"option-1":0.8,"option-2":0.2}}' }; yield { type: 'finish', reason: { kind: 'stop' } }; })(); },
  });
  assert.equal(request.provider, 'example'); assert.equal(result.mode, 'llm-json');
  const back = SettingsSchema({ ...ordinary, ...selectionPatch(ordinary, { provider: 'openrouter', model: 'typesafe/jev-1.13' }) });
  assert.deepEqual(back.messageModel, { provider: 'example', model: 'ordinary' });
  let generated;
  await composeGroupMessage({ settings: back, instruction: 'reply', eventText: 'fixture', signal: new AbortController().signal, createMessage: text => text,
    ctx: { llm: { stream: value => { generated = value; return (async function* () { yield { type: 'text-delta', text: 'fixture' }; yield { type: 'finish', reason: { kind: 'stop' } }; })(); } } },
  });
  assert.equal(generated.provider, 'example'); assert.equal(generated.model, 'ordinary');
});
