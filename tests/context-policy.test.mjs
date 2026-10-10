import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTEXT_POLICY, contextKey, renderContext, pressurePolicy, reconcileContext, readContext } from '../src/context-policy.mjs';

const snapshot = (text, key = 'state') => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'test-provider', form: 'snapshot', contextKey: key } });
const settings = { ...DEFAULT_CONTEXT_POLICY };
function history(messages) {
  const events = messages.map((data, seq) => ({ type: 'user/message', seq, data }));
  const nodes = events.map(event => event.seq);
  return { surface: { nodes }, eventAt: seq => events[seq], get seq() { return events.length; }, events,
    append(type, data, intent) {
      const event = { type, seq: events.length, data, ...intent };
      events.push(event);
      if (intent?.surfaceOp?.op === 'replace') nodes.splice(nodes.indexOf(intent.surfaceOp.startSeq), 1, event.seq);
      else if (type === 'user/message') nodes.push(event.seq);
      return event;
    } };
}
const meter = { estimateMessage: message => Math.ceil(JSON.stringify(message.content).length / 4) };
const builders = { createUserMessage: value => ({ role: 'user', ...value }), createDeveloperMessage: value => ({ role: 'developer', ...value }) };

test('unstructured state and trailing authorization are never truncated', () => {
  const text = 'state fact '.repeat(2000) + 'External actions still need authorization.';
  assert.equal(renderContext(snapshot(text), 0, settings), text);
});

test('latest publication survives a replacement at the surface head', () => {
  const session = history([snapshot('first'), snapshot('older tail')]);
  session.append('user/message', snapshot('latest'), { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 } });
  reconcileContext({ session }, { turn: 1, step: 1 }, meter, settings, builders);
  assert.ok(session.surface.nodes.includes(2));
  assert.ok(!session.surface.nodes.includes(1));
});

test('copied views read their captured full text and yield to a new local publication', () => {
  const parent = history([snapshot(JSON.stringify({ items: Array.from({length:100}, (_,i) => ({id:i,text:'detail '.repeat(100)})) }))]);
  parent.id = 'parent';
  reconcileContext({session:parent}, {turn:1,step:1}, meter, settings, builders);
  const view = parent.events.at(-1).data;
  const child = history([view]); child.id = 'child';
  assert.equal(readContext(child, {seq:0}, 100000).content, parent.events[0].data.content[0].text);
  child.append('user/message', snapshot('new child state'));
  reconcileContext({session:child}, {turn:1,step:1}, meter, settings, builders);
  assert.ok(child.surface.nodes.includes(1));
  assert.ok(!child.surface.nodes.includes(0));
});

test('already short catalogs are never expanded by the query footer', () => {
  const message = { ...snapshot('tiny catalog'), source: {kind:'test',form:'catalog',entries:[{name:'a',description:'b'}]} };
  assert.equal(renderContext(message, 0, settings), 'tiny catalog');
});

test('snapshot updates retire only their own key, preserve user instructions and retain the original', () => {
  const first = snapshot('old '.repeat(15000));
  const human = { ...snapshot('user instruction'), source: { kind: 'user' } };
  const other = snapshot('other state', 'other');
  const session = history([first, human, other, snapshot('new state')]);
  assert.deepEqual(reconcileContext({ session }, { turn: 1, step: 1 }, meter, settings, builders), { retired: 1, rendered: 0 });
  const retired = session.events.at(-1);
  assert.equal(retired.type, 'developer/message');
  assert.deepEqual(retired.data.message.content, []);
  assert.equal(session.eventAt(0).data.content[0].text, first.content[0].text);
  assert.ok(session.surface.nodes.includes(1));
  assert.ok(session.surface.nodes.includes(2));
  assert.deepEqual(reconcileContext({ session }, { turn: 1, step: 2 }, meter, settings, builders), { retired: 0, rendered: 0 });
});

test('large structured state has bounded preview and lossless paged detail after restoration', () => {
  const raw = snapshot(JSON.stringify({ selected: 'current', pending: Array.from({ length: 223 }, (_, id) => ({ id, error: 'uncertain '.repeat(35) })) }));
  const session = history([raw]);
  reconcileContext({ session }, { turn: 1, step: 1 }, meter, settings, builders);
  const visible = session.events.at(-1);
  assert.ok(visible.data.content[0].text.length <= settings.maxSnapshotCharacters);
  assert.match(visible.data.content[0].text, /"total":223/);
  assert.match(visible.data.content[0].text, /context_read/);
  let content = '', offset = 0;
  do {
    const page = readContext(session, { seq: visible.seq, offset }, 256);
    content += page.content;
    offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(content, raw.content[0].text);
  assert.deepEqual(reconcileContext({ session }, { turn: 2, step: 1 }, meter, settings, builders), { retired: 0, rendered: 0 });
});

test('catalog keeps every name and leaves the full descriptions queryable', () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ name: `skill-${i}`, description: 'description '.repeat(40) }));
  const message = { ...snapshot(JSON.stringify(entries)), source: { kind: 'skill-catalog', form: 'catalog', entries } };
  const rendered = renderContext(message, 7, settings);
  for (const entry of entries) assert.ok(rendered.includes(entry.name + ':'));
  assert.ok(rendered.length < message.content[0].text.length);
  assert.equal(contextKey({ ...message, source: { kind: 'user' } }), undefined);
});

test('budget scales with the admitted model and leaves room after compaction', () => {
  const policy = pressurePolicy(272000, 128000, settings);
  assert.deepEqual(policy, { thresholdTokens: 127680, targetTokens: 57600, retainTokens: 23040 });
  assert.ok(policy.targetTokens < policy.thresholdTokens);
  assert.ok(pressurePolicy(400000, 128000, settings).thresholdTokens > policy.thresholdTokens);
  assert.throws(() => pressurePolicy(128000, 128000, settings), /预算不足/);
});

test('detail rejects other message types, invalid offsets and surrogate splits', () => {
  const session = history([snapshot('🙂'.repeat(300))]);
  const page = readContext(session, { seq: 0, offset: 0 }, 257);
  assert.equal(page.nextOffset, 256);
  assert.equal(page.content, '🙂'.repeat(128));
  assert.throws(() => readContext(session, { seq: 0, offset: 1 }, 256), /无效/);
  assert.throws(() => readContext(session, { seq: 1 }, 256), /不是/);
});
