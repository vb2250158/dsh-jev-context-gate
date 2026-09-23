import test from 'node:test';
import assert from 'node:assert/strict';
import Schema from '@deepseek-ai/schemastery';
import { Config, DEFAULT_SETTINGS, SettingsSchema } from '../src/settings.mjs';

test('the installed settings schema accepts default rules and rejects an invalid phase', () => {
  assert.deepEqual(Config({}), DEFAULT_SETTINGS);
  assert.equal(SettingsSchema({ rules: DEFAULT_SETTINGS.rules }).rules[0].phase, 'before');
  assert.throws(() => SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], phase: 'execute' }] }));
});

test('the browser rehydrates and validates the serialized settings schema', () => {
  const browserSchema = new Schema(SettingsSchema.toJSON());
  assert.deepEqual(browserSchema(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.throws(() => browserSchema({ ...DEFAULT_SETTINGS, rules: [DEFAULT_SETTINGS.rules[0], DEFAULT_SETTINGS.rules[0]] }));
});
