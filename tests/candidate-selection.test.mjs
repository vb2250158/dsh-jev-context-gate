import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCandidates } from '../src/candidate-source.mjs';
import { rankCatalog } from '../src/catalog-prune.mjs';
import { validateRules } from '../src/policy.mjs';
import { defaultRules } from '../src/settings.mjs';

const signal = new AbortController().signal;
const base = defaultRules[2];
const manualRule = {
  ...base, id: 'notice-selection', title: '注意事项裁剪', phase: 'before', candidateSource: 'custom-list',
  candidateText: Array.from({ length: 100 }, (_, index) => `注意事项 ${index + 1}`).join('\n'),
  options: [
    { id: 'selected', label: '入选', action: { type: 'inject-selected-candidates', text: '10' } },
    { id: 'other', label: '未入选', action: { type: 'none', text: '' } },
  ],
};
const createMessage = text => ({ content: [{ type: 'text', text }] });

test('100 configured notices are ranked in one model request and the saved limit selects 10 or 5', async () => {
  const rule = validateRules([manualRule])[0];
  const entries = await resolveCandidates(rule, '当前内容', signal);
  assert.equal(entries.length, 100);
  for (const limit of [10, 5]) {
    const prompts = [];
    const selected = await rankCatalog({ settings: { provider: 'test', model: 'ordinary' },
      rule: { ...rule, options: [{ ...rule.options[0], action: { ...rule.options[0].action, text: String(limit) } }, rule.options[1]] },
      entries, input: '当前内容', signal, createMessage,
      stream: async function* (options) {
        prompts.push(JSON.parse(options.messages[0].content[0].text));
        yield { type: 'text-delta', text: JSON.stringify({ scores: Object.fromEntries(entries.map((entry, index) => [entry.name, index / 100])) }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].candidates.length, 100);
    assert.equal(selected.length, limit);
    assert.equal(selected[0].description, '注意事项 100');
  }
});

test('trusted candidate script can generate items and invalid lists fail before scoring', async () => {
  const rule = validateRules([{ ...manualRule, candidateSource: 'script', candidateScript: "return ['第一条', '第二条', '第三条']" }])[0];
  assert.deepEqual((await resolveCandidates(rule, '内容', signal)).map(row => row.description), ['第一条', '第二条', '第三条']);
  await assert.rejects(() => resolveCandidates({ ...rule, candidateScript: "return [{ id: 'same', text: '一' }, { id: 'same', text: '二' }]" }, '内容', signal), /候选项 ID/);
  assert.throws(() => validateRules([{ ...manualRule, options: [{ ...manualRule.options[0], action: { type: 'none', text: '' } }, manualRule.options[1]] }]));
});

test('large candidate lists stay within the configured batch size and threshold applies below the top count', async () => {
  const entries = Array.from({ length: 220 }, (_, index) => ({ name: `item-${index + 1}`, description: `注意事项 ${index + 1}` }));
  const sizes = [];
  const selected = await rankCatalog({ settings: { provider: 'test', model: 'ordinary' },
    rule: { ...manualRule, threshold: 0.8, options: [{ ...manualRule.options[0], action: { type: 'inject-selected-candidates', text: '5' } }, manualRule.options[1]] },
    entries, input: '当前内容', signal, createMessage,
    stream: async function* (options) {
      const candidates = JSON.parse(options.messages[0].content[0].text).candidates;
      sizes.push(candidates.length);
      yield { type: 'text-delta', text: JSON.stringify({ scores: Object.fromEntries(candidates.map(row => [row.id, Number(row.id.slice(5)) / 220])) }) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });
  assert.ok(sizes.length > 1 && sizes.every(size => size <= 100));
  assert.deepEqual(selected.map(row => row.name), ['item-220', 'item-219', 'item-218', 'item-217', 'item-216']);
  const short = await rankCatalog({ settings: { provider: 'test', model: 'ordinary' },
    rule: { ...manualRule, threshold: 0.8 }, entries: entries.slice(0, 3), input: '当前内容', signal, createMessage,
    stream: async function* (options) {
      const candidates = JSON.parse(options.messages[0].content[0].text).candidates;
      yield { type: 'text-delta', text: JSON.stringify({ scores: Object.fromEntries(candidates.map(row => [row.id, 0.2])) }) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });
  assert.deepEqual(short, []);
});
