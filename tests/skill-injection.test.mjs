import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSkillRequests } from '../src/skill-injection.mjs';

const agent = { session: { header: { cwd: '/workspace' }, surface: { nodes: [] }, eventAt: () => undefined } };
const signal = new AbortController().signal;
const request = name => ({ ruleId: `rule-${name}`, optionId: 'yes', name });
const skill = (name, modelInvocable = true) => ({ name, invocation: { modelInvocable }, content: `${name} body` });
const run = (requests, overrides = {}) => resolveSkillRequests({
  requests, existingMessages: [], agent, signal, maxCharacters: 1000, usedCharacters: 0,
  skills: { get: async name => skill(name) }, render: value => `<skill_content>${value.content}</skill_content>`,
  createMessage: (text, source) => ({ source, content: [{ type: 'text', text }] }), ...overrides,
});

test('selected skill loads through the agent scope and does not duplicate user-explicit invocation', async () => {
  const lookups = [];
  const result = await run([request('review'), request('review'), request('private')], {
    existingMessages: [{ source: { kind: 'skill-invocation', name: 'private' } }],
    skills: { get: async (name, lookup) => { lookups.push(lookup); return skill(name); } },
  });
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0].content[0].text, /review body/);
  assert.equal(result.messages[0].source.plugin, 'dsh-jev-context-gate/skill/review');
  assert.deepEqual(result.outcomes.map(row => row.status), ['applied', 'already-loaded', 'already-loaded']);
  assert.equal(lookups[0].scope, agent);
  assert.equal(lookups[0].cwd, '/workspace');
});

test('visible durable skill content prevents reinjection until removed from the surface', async () => {
  const events = new Map([
    [2, { type: 'user/message', data: { source: { kind: 'plugin', plugin: 'dsh-jev-context-gate/skill/review' } } }],
    [3, { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'private' } } }],
  ]);
  const sessionAgent = { session: { header: { cwd: '/workspace' }, surface: { nodes: [2, 3] }, eventAt: seq => events.get(seq) } };
  const result = await run([request('review'), request('private')], { agent: sessionAgent });
  assert.deepEqual(result.outcomes.map(row => row.status), ['already-loaded', 'already-loaded']);
  sessionAgent.session.surface.nodes = [];
  const afterCompaction = await run([request('review')], { agent: sessionAgent });
  assert.equal(afterCompaction.outcomes[0].status, 'applied');
});

test('hidden, missing, failing, and over-budget skills do not enter model input', async () => {
  const result = await run([request('hidden'), request('missing'), request('broken'), request('long')], {
    maxCharacters: 12,
    skills: { get: async name => {
      if (name === 'broken') throw new Error('provider failed');
      return name === 'missing' ? undefined : skill(name, name !== 'hidden');
    } },
  });
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.outcomes.map(row => row.status), ['skill-unavailable', 'skill-unavailable', 'skill-unavailable', 'budget-exceeded']);
});

test('skill-injection rule runs for each candidate before any body enters the model', async () => {
  const seen = [];
  const result = await run([request('irrelevant'), request('review')], {
    beforeInject: async value => {
      seen.push(value.name);
      return value.name === 'irrelevant' ? { skip: true, context: '' } : { skip: false, context: 'Read source first.' };
    },
  });
  assert.deepEqual(seen, ['irrelevant', 'review']);
  assert.deepEqual(result.outcomes.map(row => row.status), ['skipped-by-rule', 'applied']);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0].content[0].text, /Read source first/);
});

test('failed configured skill judgement prevents injection', async () => {
  const result = await run([request('review')], { beforeInject: async () => { throw new Error('judge unavailable'); } });
  assert.deepEqual(result.messages, []);
  assert.equal(result.outcomes[0].status, 'skill-judgement-unavailable');
});
