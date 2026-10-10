/** Keyless Loader/production-loop check; DSH_SOURCE_ROOT selects the patched host. */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readContext } from '../src/context-policy.mjs';

if (!process.env.DSH_SOURCE_ROOT) throw new Error('Set DSH_SOURCE_ROOT to the patched DSH checkout.');
const root = resolve(process.env.DSH_SOURCE_ROOT);
const plugin = dirname(dirname(fileURLToPath(import.meta.url)));
const native = (group, name) => pathToFileURL(join(root, 'packages', group, name, 'lib/index.js')).href;
const { boot } = await import(native('boot', 'app-boot'));
const { SessionId } = await import(native('core', 'session'));
const { createUserMessage } = await import(native('llm', 'llm'));
const dir = await mkdtemp(join(tmpdir(), 'dsh-context-policy-'));
let ctx;
try {
  const fixture = `
import { LlmAdapter, createUserMessage, createDeveloperMessage } from ${JSON.stringify(native('llm', 'llm'))};
import { defineTool } from ${JSON.stringify(native('core', 'tools'))};
import { installContextPolicy, DEFAULT_CONTEXT_POLICY } from ${JSON.stringify(pathToFileURL(join(plugin, 'src/context-policy.mjs')).href)};
export const inject = ['agentLoop', 'tools', 'tokenMeter', 'llm', 'systemPrompt'];
export function apply(ctx) {
  const state = { revision: 0, requests: [] };
  ctx.provide('contextFixture', state);
  class Adapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 272000, maxTokens: 128000 } }; }
    async *stream(options) {
      state.requests.push(options);
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['fixture'], new Adapter()));
  ctx.effect(() => ctx.systemPrompt.context({ name: 'plans', order: 1,
    text: () => JSON.stringify({ revision: state.revision, pending: Array.from({ length: 223 }, (_, i) => ({ id: i, text: 'detail '.repeat(70) })) }) }));
  ctx.effect(() => ctx.systemPrompt.context({ name: 'authorization', order: 2, text: 'User authorization remains required for external messages.' }));
  installContextPolicy(ctx, () => ({ contextPolicy: DEFAULT_CONTEXT_POLICY }), { createUserMessage, createDeveloperMessage, defineTool });
}
`;
  await writeFile(join(dir, 'fixture.mjs'), fixture);
  const entries = [['llm','llm'], ['core','session'], ['session','session-projection'], ['core','system-prompt'], ['core','tools'], ['core','agent'], ['core','agent-loop'], ['llm','token-meter'], ['compaction','compaction-basic']]
    .map(([group,name]) => ({ id: name, name: native(group,name), ...(name === 'agent-loop' ? { config: { agents: [] } } : {}) }));
  entries.push({ id: 'policy', name: pathToFileURL(join(dir, 'fixture.mjs')).href });
  await writeFile(join(dir, 'cordis.yml'), JSON.stringify(entries));
  ctx = await boot('context-policy-test', join(dir, 'cordis.yml'));
  const agent = await ctx.agentLoop.create(SessionId('context-policy-smoke'), { provider: 'fixture', model: 'fixture', maxTokens: 128000 });
  const send = async text => {
    const idle = new Promise((done,reject) => {
      const timer = setTimeout(() => { off(); reject(new Error('Agent did not become idle')); }, 10000);
      const off = ctx.on('agent/status', ({agent: subject,status}) => { if(subject === agent && status === 'idle') { clearTimeout(timer); off(); done(); } });
    });
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
    await idle;
  };
  for (let revision = 0; revision < 30; revision++) {
    ctx.contextFixture.revision = revision;
    await send(revision === 0 ? 'Keep the original task identity.' : 'continue');
  }
  const before = agent.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context').length;
  await send('unchanged state');
  const events = agent.session.snapshotEvents();
  const after = events.filter(e => e.type === 'user/message' && e.data.source.kind === 'runtime-context').length;
  assert.equal(after, before, 'unchanged canonical snapshot must not be reinjected');
  const messages = ctx.contextFixture.requests.at(-1).messages;
  const snapshots = messages.filter(m => m.source?.kind === 'runtime-context');
  assert.equal(snapshots.length, 1);
  const active = snapshots[0];
  assert.ok(active.content[0].text.includes('authorization remains required'));
  assert.ok(active.content[0].text.length <= 12000);
  assert.ok(messages.some(m => m.content.some(b => b.text === 'Keep the original task identity.')));
  assert.ok(messages.every(m => m.content.length > 0));
  const originalSeq = active.source.contextPolicy.sourceSeq;
  let offset = 0, original = '';
  do { const page = readContext(agent.session, { seq: originalSeq, offset }, 4096); original += page.content; offset = page.nextOffset; } while(offset !== null);
  assert.ok(original.includes('"id":222'));
  assert.ok(original.includes('"revision":29'));
  const inputSnapshot = {
    requests: ctx.contextFixture.requests.length,
    activeSnapshots: snapshots.length,
    pendingTotal: JSON.parse(active.content[0].text.split('[plans]\n')[1].split('\n\n')[0]).pending.total,
    previewIds: JSON.parse(active.content[0].text.split('[plans]\n')[1].split('\n\n')[0]).pending.entries.map(entry => entry.id),
    latestRevision: 29,
    unchangedStateReinjected: after !== before,
    instructionsRetained: true,
    completeOriginalReadable: true,
    compactions: events.filter(e => e.type === 'compaction/end').length,
  };
  assert.deepEqual(inputSnapshot, JSON.parse(await readFile(join(plugin, 'tests/expected/context-policy-model-input.json'), 'utf8')));
  for (let index = 0; index < 30; index++) await send('long ordinary history '.repeat(1000));
  const pressureEvents = agent.session.snapshotEvents();
  assert.ok(pressureEvents.some(event => event.type === 'compaction/end'), 'growing ordinary history must still compact');
  assert.equal(agent.status, 'idle');
  console.log(JSON.stringify(inputSnapshot));
  console.log(JSON.stringify({ pressureCompactions: pressureEvents.filter(event => event.type === 'compaction/end').length }));
} finally {
  if (ctx) await ctx.fiber.dispose();
  assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + '/'.replace('/', process.platform === 'win32' ? '\\' : '/')));
  await rm(dir, { recursive: true, force: true });
}
