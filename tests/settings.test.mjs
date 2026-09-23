import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, DEFAULT_SETTINGS, SettingsSchema } from '../src/settings.mjs';

test('the installed settings schema accepts default rules and rejects an invalid phase', () => {
  assert.deepEqual(Config({}), DEFAULT_SETTINGS);
  assert.equal(SettingsSchema({ rules: DEFAULT_SETTINGS.rules }).rules[0].phase, 'before');
  assert.throws(() => SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], phase: 'execute' }] }));
});
