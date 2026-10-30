import assert from 'node:assert/strict';
import test from 'node:test';
import { modeForModel } from '../src/mode.mjs';
import { modelChoices } from '../src/model-selection.mjs';
import { decideQuestions } from '../src/decision-adapter.mjs';
import { defaultRules, SettingsSchema } from '../src/settings.mjs';
import { validateRules } from '../src/policy.mjs';
import exceptions from '../docs/native-model-exceptions.json' with { type: 'json' };

test('specialized protocols are explained instead of sent as chat requests', async () => {
  let calls = 0;
  const stream = () => { calls++; throw new Error('unexpected chat request'); };
  for (const { model } of exceptions) {
    const settings = { provider: 'openrouter', model };
    assert.equal(modeForModel(model, settings.provider), 'unsupported');
    const row = modelChoices({ groups: [{ id: settings.provider, name: 'OpenRouter', models: [{ id: model, name: model }] }] }).find(row => row.model === model);
    assert.match(row.label, /不支持通用题型/);
    assert.doesNotMatch(row.label, /兼容模式/);
    await assert.rejects(async () => decideQuestions({ settings, state: 'fixture', questions: {}, stream }), /不支持通用三题型/);
  }
  assert.equal(calls, 0);
});

test('inactive score-level drafts do not prevent switching back to choice or noul', () => {
  const candidate = defaultRules.find(rule => rule.id === 'skill-trimming');
  for (const questionType of ['choice', 'noul']) {
    const rule = { ...candidate, questionType, scoreLevels: [''] };
    assert.deepEqual(validateRules([rule])[0].scoreLevels, ['']);
    assert.deepEqual(SettingsSchema({ rules: [rule] }).rules[0].scoreLevels, ['']);
  }
  const invalid = { ...candidate, questionType: 'score', scoreLevels: [''] };
  assert.throws(() => validateRules([invalid]), /score levels/);
  assert.throws(() => SettingsSchema({ rules: [invalid] }), /score levels/);
});
