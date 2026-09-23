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
  assert.throws(() => validateRules([rule, rule]));
  assert.throws(() => validateRules([{ ...rule, options: [{ ...rule.options[0], action: { type: 'run-shell', text: 'x' } }, rule.options[1]] }]));
});
