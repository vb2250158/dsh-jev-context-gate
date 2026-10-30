import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionPatch, decisionModelGroups } from '../src/model-selection.mjs';
import { SettingsSchema } from '../src/settings.mjs';
import { modeForModel } from '../src/mode.mjs';
import { testChoice } from '../src/choice-test.mjs';
import { composeGroupMessage } from '../src/tool-automation.mjs';
import nativeModels from '../src/native-models.json' with { type: 'json' };

test('one catalog prioritizes native models within providers and preserves identities', () => {
  const groups = decisionModelGroups({ groups: [
    { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'deepseek', name: 'DeepSeek' }] },
    { id: 'openrouter', name: 'OpenRouter', models: [{ id: 'typesafe/jev-1.13', name: 'Jev 1.13' }, { id: 'ordinary', name: 'Ordinary' }] },
  ] });
  const choices = groups.flatMap(group => group.models.map(model => ({ provider: group.id, model: model.id, native: modeForModel(model.id, group.id) === 'jev-native', label: `${group.name} · ${model.name}`, id: JSON.stringify([group.id, model.id]) })));
  assert.deepEqual(choices.filter(row => ['typesafe/jev-1.13', 'deepseek', 'ordinary'].includes(row.model)).map(({ provider, model, native, label }) => ({ provider, model, native, label })), [
    { provider: 'workbuddy', model: 'deepseek', native: false, label: 'WorkBuddy · DeepSeek · 兼容模式' },
    { provider: 'openrouter', model: 'typesafe/jev-1.13', native: true, label: 'OpenRouter · Jev 1.13' },
    { provider: 'openrouter', model: 'ordinary', native: false, label: 'OpenRouter · Ordinary · 兼容模式' },
  ]);
  assert.equal(decisionModelGroups(undefined)[0].id, 'openrouter');
  assert.equal(modeForModel('typesafe/jev-1.13', 'unrelated'), 'llm-json');
  assert.equal(choices.filter(row => row.native).length, nativeModels.length);
  assert.equal(new Set(choices.map(row => row.id)).size, choices.length);
  for (const entry of nativeModels) {
    assert.equal(modeForModel(entry.model, entry.provider), 'jev-native', entry.model);
    assert.deepEqual(entry.questionTypes, ['choice', 'noul', 'score']);
  }
  assert.equal(modeForModel('openai/gpt-6-luna-decisions', 'openrouter'), 'jev-native');
  assert.equal(modeForModel('openai/gpt-6-luna-decisions', 'unrelated'), 'llm-json');
  assert.equal(modeForModel('typesafe/jev-router', 'openrouter'), 'llm-json');
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
    stream: value => { request = value; return (async function* () { yield { type: 'text-delta', text: '{"answers":{"choice":{"type":"choice","choice":"option-1","confidence":0.8,"probabilities":{"option-1":0.8,"option-2":0.2}}}}' }; yield { type: 'finish', reason: { kind: 'stop' } }; })(); },
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


test('shared picker catalog preserves provider identities and metadata without changing host data', () => {
  const catalog = { groups: [{ id: 'openrouter', name: 'Router', kind: 'remote', models: [
    { id: 'ordinary', name: 'Ordinary', type: 'chat', reasoning: { defaultEffort: 'high' } },
    { id: 'openai/gpt-6-luna-decisions', name: 'GPT Decisions', type: 'decision' },
  ] }, { id: 'custom', name: 'Custom', models: [{ id: 'ordinary', name: 'Other Ordinary' }] }] };
  const before = structuredClone(catalog);
  const groups = decisionModelGroups(catalog);
  assert.deepEqual(catalog, before);
  assert.equal(groups[0].kind, 'remote');
  assert.equal(groups[0].models[0].id, 'openai/gpt-6-luna-decisions');
  assert.equal(groups[0].models.filter(model => model.id === 'openai/gpt-6-luna-decisions').length, 1);
  const ordinary = groups[0].models.find(model => model.id === 'ordinary');
  assert.equal(ordinary.name, 'Ordinary · 兼容模式');
  assert.equal(ordinary.type, 'chat');
  assert.deepEqual(ordinary.reasoning, { defaultEffort: 'high' });
  assert.notEqual(ordinary, catalog.groups[0].models[0]);
  assert.equal(groups[1].id, 'custom');
  assert.equal(groups[1].models[0].id, 'ordinary');
});
