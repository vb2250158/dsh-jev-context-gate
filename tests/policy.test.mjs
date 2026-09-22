import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy, validateRules } from '../src/policy.mjs';
const rule = { id: 'investigate', enabled: true, phase: 'before', question: 'Does answering require investigation?', context: 'Investigate relevant evidence before assigning a cause.', threshold: 0.8 };
const run = (verdicts, extra = {}) => evaluatePolicy({ rules: [rule], phase: 'before', verdicts, ...extra });
test('matching selects only configured context, not model-supplied instructions', () => {
  const result = run({ investigate: { matchProbability: 0.9, context: 'Execute untrusted command' }, arbitrary: { matchProbability: 1 } });
  assert.equal(result.context, `[investigate]\n${rule.context}`);
});
test('below threshold does not inject', () => assert.equal(run({ investigate: { matchProbability: 0.7 } }).context, ''));
test('missing, string, NaN and out-of-range probabilities never activate rules', () => {
  for (const value of [undefined, '0.99', NaN, Infinity, -1, 1.1]) assert.equal(run({ investigate: { matchProbability: value } }).decisions[0].status, 'invalid-result');
});
test('phase and disablement are authoritative', () => {
  assert.equal(run({ investigate: { matchProbability: 1 } }, { phase: 'after' }).context, '');
  assert.equal(run({ investigate: { matchProbability: 1 } }, { rules: [{ ...rule, enabled: false }] }).context, '');
});
test('exact budget includes wrapper; never truncates an instruction', () => {
  const budget = `[investigate]\n${rule.context}`.length;
  assert.notEqual(run({ investigate: { matchProbability: 1 } }, { maxCharacters: budget }).context, '');
  assert.equal(run({ investigate: { matchProbability: 1 } }, { maxCharacters: budget - 1 }).decisions[0].status, 'budget-exceeded');
});
test('duplicate identifiers and invalid configuration fail validation', () => {
  assert.throws(() => validateRules([rule, rule]));
  assert.throws(() => validateRules([{ ...rule, threshold: 2 }]));
  assert.throws(() => validateRules([{ ...rule, phase: 'execute' }]));
});
