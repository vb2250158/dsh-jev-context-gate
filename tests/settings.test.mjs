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
  assert.equal(migrated.description, '');
  assert.equal(migrated.title, '');
  assert.equal(migrated.options[0].action.text, '检查');
  assert.ok(!Object.hasOwn(migrated, 'context'));
  assert.throws(() => SettingsSchema({ rules: [{ ...legacy, phase: 'execute' }] }));
  assert.equal(SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], description: '可编辑的规则说明' }] }).rules[0].description, '可编辑的规则说明');
  assert.equal(SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], title: '可编辑的规则标题' }] }).rules[0].title, '可编辑的规则标题');
  assert.throws(() => SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], title: '长'.repeat(121) }] }));
  assert.throws(() => SettingsSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], description: '长'.repeat(501) }] }));
  const skillRule = { ...DEFAULT_SETTINGS.rules[0], input: 'user-message-with-skills', options: [
    { id: 'yes', label: '使用 Skill', action: { type: 'inject-skill', text: 'code-review' } },
    DEFAULT_SETTINGS.rules[0].options[1],
  ] };
  assert.equal(SettingsSchema({ rules: [skillRule] }).rules[0].options[0].action.text, 'code-review');
  assert.throws(() => SettingsSchema({ rules: [{ ...skillRule, options: DEFAULT_SETTINGS.rules[0].options }] }));
  const injectionRule = { ...skillRule, phase: 'skill-injection', input: 'skill-summary', question: '是否继续注入？', options: [
    { id: 'yes', label: '继续', action: { type: 'none', text: '' } },
    { id: 'no', label: '跳过', action: { type: 'skip-skill', text: '' } },
  ] };
  assert.equal(SettingsSchema({ rules: [injectionRule] }).rules[0].phase, 'skill-injection');
  const priorCatalogRule = { ...DEFAULT_SETTINGS.rules[2], candidateSource: 'skill-catalog', options: [
    { id: 'selected', label: '入选', action: { type: 'keep-top-skills', text: '5' } },
    { id: 'other', label: '未入选', action: { type: 'none', text: '' } },
  ], selectionValue: '' };
  const migratedCatalog = SettingsSchema({ rules: [priorCatalogRule] }).rules[0];
  assert.equal(migratedCatalog.candidateSource, 'event-params');
  assert.equal(migratedCatalog.candidateParameterKey, 'skills');
  assert.equal(migratedCatalog.selectionValue, '5');
  assert.deepEqual(migratedCatalog.options, []);
});

test('browser rehydrates and validates the serialized settings schema', () => {
  const browserSchema = new Schema(SettingsSchema.toJSON());
  assert.deepEqual(browserSchema(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.equal(browserSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], description: '浏览器中保存的说明' }] }).rules[0].description, '浏览器中保存的说明');
  assert.equal(browserSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], title: '浏览器中保存的标题' }] }).rules[0].title, '浏览器中保存的标题');
  assert.equal(browserSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], options: [
    { id: 'yes', label: '使用 Skill', action: { type: 'inject-skill', text: 'code-review' } }, DEFAULT_SETTINGS.rules[0].options[1],
  ] }] }).rules[0].options[0].action.type, 'inject-skill');
  assert.equal(browserSchema({ rules: [{ ...DEFAULT_SETTINGS.rules[0], phase: 'skill-injection', input: 'skill-summary', options: [
    { id: 'yes', label: '继续', action: { type: 'none', text: '' } },
    { id: 'no', label: '跳过', action: { type: 'skip-skill', text: '' } },
  ] }] }).rules[0].options[1].action.type, 'skip-skill');
  assert.throws(() => browserSchema({ ...DEFAULT_SETTINGS, rules: [DEFAULT_SETTINGS.rules[0], DEFAULT_SETTINGS.rules[0]] }));
});
