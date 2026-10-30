const noulAnswers = scores => ({ answers: Object.fromEntries(Object.values(scores).map((noul, i) => [`candidate-${i}`, { type: 'noul', noul }])) });
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCatalog } from '../src/catalog-prune.mjs';
import { recordCatalogSelection } from '../src/catalog-selection-record.mjs';
import { SettingsSchema } from '../src/settings.mjs';

for (const native of [false, true]) test(`${native ? 'native' : 'ordinary'} candidate diagnostics retain the exact scores, ordering and selection`, async () => {
  const records = [], operations = [];
  const entries = [{ name: 'a', description: 'private skill text' }, { name: 'b', description: 'private skill text' }, { name: 'c', description: 'private skill text' }];
  const scores = { a: 0.3, b: 0.9, c: 0.7 };
  const stream = async function* (_options, operation) { operations.push(operation); yield { type: 'text-delta', text: JSON.stringify(noulAnswers(scores)) }; yield { type: 'finish', reason: { kind: 'stop' } }; };
  stream.decide = async (_request, operation) => { operations.push(operation); return { answers: Object.fromEntries(Object.values(scores).map((score, i) => [`candidate-${i}`, { type: 'noul', noul: score }])) }; };
  const session = { append: (type, data, options) => records.push({ type, data, options }) };
  for (const [mode, expected] of [['top', ['b']], ['bottom', ['c']], ['score-above', ['b', 'c']], ['score-below', ['a']]]) {
    const selected = await rankCatalog({ settings: native ? SettingsSchema({ decisionApi: { enabled: true } }) : { provider: 'fixture', model: 'ordinary' },
      rule: { id: 'rule', title: 'Rule', phase: 'skill-catalog', selectionMode: mode, selectionValue: mode === 'top' || mode === 'bottom' ? '1' : '50', threshold: 0.5, selectionAction: 'prune' },
      entries, input: 'private conversation', signal: new AbortController().signal, stream, createMessage: text => ({ content: [{ type: 'text', text }] }),
      onSelection: summary => recordCatalogSelection(session, { turn: 1, step: 2 }, summary, () => assert.fail('append failed')) });
    assert.deepEqual(selected.map(row => row.name), expected);
    const report = records.at(-1);
    assert.equal(report.data.id, operations.at(-1).selectionId);
    assert.deepEqual(report.options, { ignorable: true });
    assert.deepEqual(report.data.candidates.map(({ name, score, rank, selected }) => ({ name, score, rank, selected })),
      ['b', 'c', 'a'].map((name, i) => ({ name, score: scores[name], rank: i + 1, selected: expected.includes(name) })));
    assert.doesNotMatch(JSON.stringify(report), /private conversation|private skill text/);
  }
  assert.equal(new Set(records.map(row => row.data.id)).size, 4);
});

test('diagnostic append failure remains observational', () => {
  const failure = Error('append failed'), errors = [];
  assert.doesNotThrow(() => recordCatalogSelection({ append() { throw failure; } }, { turn: 1, step: 1 }, {}, error => errors.push(error)));
  assert.deepEqual(errors, [failure]);
});
