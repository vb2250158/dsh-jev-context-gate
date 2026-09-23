import test from 'node:test';
import assert from 'node:assert/strict';
import Schema from '@deepseek-ai/schemastery';
import { Config, DEFAULT_SETTINGS, SettingsSchema } from '../src/settings.mjs';

test('default rules have option-owned actions and the schema migrates saved legacy rules', () => {
  assert.deepEqual(Config({}), DEFAULT_SETTINGS);
  assert.match(DEFAULT_SETTINGS.rules[0].options[0].action.text, /源码、配置、日志/);
  const legacy = { id: 'old', enabled: true, phase: 'before', question: '检查吗？', context: '检查', threshold: 0.8 };
  const migrated = SettingsSchema({ rules: [legacy] }).rules[0];
  assert.equal(migrated.input, 'latest-user-message');
  assert.equal(migrated.options[0].action.text, '检查');
  assert.ok(!Object.hasOwn(migrated, 'context'));
  assert.throws(() => SettingsSchema({ rules: [{ ...legacy, phase: 'execute' }] }));
});

test('browser rehydrates and validates the serialized settings schema', () => {
  const browserSchema = new Schema(SettingsSchema.toJSON());
  assert.deepEqual(browserSchema(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.throws(() => browserSchema({ ...DEFAULT_SETTINGS, rules: [DEFAULT_SETTINGS.rules[0], DEFAULT_SETTINGS.rules[0]] }));
});
