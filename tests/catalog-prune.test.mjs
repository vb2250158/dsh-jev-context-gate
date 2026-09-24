import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogInput, rankCatalog, pruneCatalogMessage } from '../src/catalog-prune.mjs';
import { defaultRules } from '../src/settings.mjs';

const rule = defaultRules.find(row => row.id === 'skill-trimming');
const entries = Array.from({ length: 12 }, (_, index) => ({ name: `skill-${index}`, description: `用途 ${index}` }));
const signal = new AbortController().signal;
const createMessage = text => ({ content: [{ type: 'text', text }] });

test('Skill 裁剪 uses current visible context and rule-configured count, title and threshold', async () => {
  const agent = { session: { surface: { nodes: [1, 2] }, eventAt: seq => seq === 1
    ? { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '旧任务' }] } }
    : { type: 'assistant/message', data: { message: { source: { kind: 'model' }, content: [{ type: 'text', text: '已完成' }] } } } } };
  const pending = [{ source: { kind: 'user' }, content: [{ type: 'text', text: '现在检查代码' }] },
    { source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '全部 Skill' }] }];
  const input = catalogInput(rule, agent, pending, 12000);
  assert.match(input, /旧任务[\s\S]*已完成[\s\S]*现在检查代码/);
  assert.doesNotMatch(input, /全部 Skill/);
  const prompts = [];
  const selected = await rankCatalog({ settings: { provider: 'test', model: 'ordinary' },
    rule: { ...rule, question: '与上下文最相关的 Skill 有哪些？', options: [{ ...rule.options[0], action: { type: 'keep-top-skills', text: '3' } }, rule.options[1]] },
    entries, input, signal, createMessage,
    stream: async function* (options) {
      prompts.push(JSON.parse(options.messages[0].content[0].text));
      yield { type: 'text-delta', text: JSON.stringify({ scores: Object.fromEntries(entries.map((entry, index) => [entry.name, index / 12])) }) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });
  assert.equal(prompts[0].question, '与上下文最相关的 Skill 有哪些？');
  assert.deepEqual(selected.map(entry => entry.name), ['skill-11', 'skill-10', 'skill-9']);
  const original = { source: { kind: 'skill-catalog', form: 'catalog', entries }, content: [{ type: 'text', text: '<available_skills>\nall\n</available_skills>' }] };
  const pruned = pruneCatalogMessage(original, selected, value => value);
  assert.equal(pruned.source.entries.length, 3);
  assert.match(pruned.content[0].text, /skill-11/);
  assert.doesNotMatch(pruned.content[0].text, /skill-0/);
  assert.equal(original.source.entries.length, 12);
});

test('invalid catalog ranking never publishes a fabricated selection', async () => {
  await assert.rejects(() => rankCatalog({ settings: { provider: 'test', model: 'ordinary' }, rule, entries,
    input: '任务', signal, createMessage,
    stream: async function* () { yield { type: 'text-delta', text: '{"scores":{"skill-0":1}}' }; yield { type: 'finish', reason: { kind: 'stop' } }; },
  }), /Invalid catalog judgement scores/);
});
