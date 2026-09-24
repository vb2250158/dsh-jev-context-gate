import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy, validateRules } from '../src/policy.mjs';

const rule = { id: 'investigate', enabled: true, phase: 'before', input: 'latest-user-message', customInput: '',
  questionSource: 'configured', questionScript: '', question: '需要先检查证据吗？', threshold: 0.8,
  options: [
    { id: 'yes', label: '需要', action: { type: 'inject-context', text: '先检查证据' } },
    { id: 'no', label: '不需要', action: { type: 'none', text: '' } },
  ] };
const run = (probabilities, extra = {}) => evaluatePolicy({ rules: [rule], phase: 'before',
  verdicts: { investigate: { probabilities } }, ...extra });

test('only the selected option owns the applied action', () => {
  assert.equal(run({ yes: 0.9, no: 0.1 }).context, '[investigate · 需要]\n先检查证据');
  assert.equal(run({ yes: 0.1, no: 0.9 }).context, '');
  const altered = { ...rule, options: [
    rule.options[0], { ...rule.options[1], action: { type: 'inject-context', text: '直接回答' } },
  ] };
  assert.equal(run({ yes: 0.1, no: 0.9 }, { rules: [altered] }).context, '[investigate · 不需要]\n直接回答');
});

test('threshold and malformed probability maps fail closed', () => {
  assert.equal(run({ yes: 0.7, no: 0.3 }).decisions[0].status, 'below-threshold');
  for (const probabilities of [{ yes: 1 }, { yes: 2, no: -1 }, { yes: '0.9', no: 0.1 }, { yes: 0.6, no: 0.1 }])
    assert.equal(run(probabilities).decisions[0].status, 'invalid-result');
});

test('event, enabled state and exact context budget are respected', () => {
  const text = '[investigate · 需要]\n先检查证据';
  assert.equal(run({ yes: 0.9, no: 0.1 }, { maxCharacters: text.length }).context, text);
  assert.equal(run({ yes: 0.9, no: 0.1 }, { maxCharacters: text.length - 1 }).decisions[0].status, 'budget-exceeded');
  assert.equal(run({ yes: 0.9, no: 0.1 }, { phase: 'after' }).context, '');
  assert.equal(run({ yes: 0.9, no: 0.1 }, { rules: [{ ...rule, enabled: false }] }).context, '');
});

test('legacy rule migrates to yes/no actions and invalid actions are rejected', () => {
  const legacy = { id: 'legacy', enabled: true, phase: 'before', question: '检查吗？', context: '检查', threshold: 0.8 };
  assert.equal(validateRules([legacy])[0].options[0].action.text, '检查');
  assert.equal(validateRules([legacy])[0].description, '');
  assert.equal(validateRules([legacy])[0].title, '');
  assert.equal(validateRules([{ ...rule, description: '可编辑的规则说明' }])[0].description, '可编辑的规则说明');
  assert.equal(validateRules([{ ...rule, title: '可编辑的规则标题' }])[0].title, '可编辑的规则标题');
  assert.throws(() => validateRules([{ ...rule, title: '长'.repeat(121) }]));
  assert.throws(() => validateRules([{ ...rule, description: '长'.repeat(501) }]));
  assert.throws(() => validateRules([rule, rule]));
  assert.throws(() => validateRules([{ ...rule, options: [{ ...rule.options[0], action: { type: 'run-shell', text: 'x' } }, rule.options[1]] }]));
});

test('a selected skill action requests a named skill and validates the skill-aware input', () => {
  const skillRule = { ...rule, input: 'user-message-with-skills', options: [
    { id: 'yes', label: '使用代码审查 Skill', action: { type: 'inject-skill', text: 'code-review' } },
    rule.options[1],
  ] };
  const result = run({ yes: 0.9, no: 0.1 }, { rules: [skillRule] });
  assert.equal(result.context, '');
  assert.deepEqual(result.skillRequests, [{ ruleId: 'investigate', optionId: 'yes', name: 'code-review' }]);
  assert.equal(result.decisions[0].status, 'pending-skill');
  assert.deepEqual(run({ yes: 0.7, no: 0.3 }, { rules: [skillRule] }).skillRequests, []);
  assert.throws(() => validateRules([{ ...skillRule, options: rule.options }]));
  assert.throws(() => validateRules([{ ...skillRule, options: [
    { ...skillRule.options[0], action: { type: 'inject-skill', text: 'Bad Name' } }, rule.options[1],
  ] }]));
  assert.throws(() => validateRules([{ ...skillRule, phase: 'after', input: 'tool-results' }]));
});

test('skill-injection event accepts arbitrary questions and option-owned skip behavior', () => {
  const skillRule = { ...rule, id: 'skill-fit', phase: 'skill-injection', input: 'skill-summary',
    question: '这份 Skill 是否与当前用户目标冲突？', options: [
      { id: 'conflict', label: '冲突', action: { type: 'skip-skill', text: '' } },
      { id: 'fit', label: '适合', action: { type: 'none', text: '' } },
    ] };
  assert.equal(validateRules([skillRule])[0].question, skillRule.question);
  const skipped = evaluatePolicy({ rules: [skillRule], phase: 'skill-injection', verdicts: { 'skill-fit': { probabilities: { conflict: 0.91, fit: 0.09 } } } });
  assert.equal(skipped.skipSkill, true);
  assert.equal(skipped.decisions[0].status, 'applied');
  const allowed = evaluatePolicy({ rules: [skillRule], phase: 'skill-injection', verdicts: { 'skill-fit': { probabilities: { conflict: 0.05, fit: 0.95 } } } });
  assert.equal(allowed.skipSkill, false);
  assert.throws(() => validateRules([{ ...skillRule, options: [{ ...skillRule.options[0], action: { type: 'inject-skill', text: 'review' } }, skillRule.options[1]] }]));
});

test('catalog trimming is a saved rule with a configurable top count', () => {
  const catalogRule = { ...rule, id: 'skill-trimming', title: 'Skill 裁剪', phase: 'skill-catalog', input: 'current-context-text',
    question: '与当前上下文最相关的 Skill 有哪些？', threshold: 0, options: [
      { id: 'selected', label: '入选', action: { type: 'keep-top-skills', text: '10' } },
      { id: 'other', label: '未入选', action: { type: 'none', text: '' } },
    ] };
  assert.equal(validateRules([catalogRule])[0].options[0].action.text, '10');
  assert.throws(() => validateRules([{ ...catalogRule, options: [
    { ...catalogRule.options[0], action: { type: 'keep-top-skills', text: '51' } }, catalogRule.options[1],
  ] }]));
});
