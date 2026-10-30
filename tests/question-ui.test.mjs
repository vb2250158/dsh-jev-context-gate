import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Exercise component callbacks without a DOM; browser/theme acceptance runs separately.
async function loadComponent(file, extra = {}) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(`../src/client/${file}.tsx`, import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node', loader: { '.module.css': 'empty' },
    external: ['react', '@deepseek-ai/dsh-client-ui-primitives'] });
  const states = []; let cursor = 0; let effects = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef: value => { const index = cursor++; return states[index] ??= { current: value }; },
    useEffect(effect, deps) { const index = cursor++, previous = states[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => {
        previous?.cleanup?.(); states[index] = { deps, cleanup: effect() };
      }); } };
  const module = { exports: {} };
  vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, AbortController, fetch: async () => ({ json: async () => ({ events: [], adapters: [] }) }),
    require: name => name === 'react' ? react : { Button: 'Button', Input: 'Input', Menu: 'Menu', Modal: 'Modal', Switch: 'Switch' }, ...extra });
  return props => { cursor = 0; effects = []; const tree = module.exports[file](props); for (const effect of effects) effect(); return tree; };
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
const rule = { id: 'rule-one', enabled: true, title: 'Rule', description: '', phase: 'before', input: 'latest-user-message',
  candidateSource: 'none', selectionMode: 'top', selectionValue: '10', selectionAction: 'prune', questionSource: 'configured', question: 'Check?', thresholdPercent: '80',
  options: [{ id: 'yes', label: 'Yes', action: { type: 'inject-context', text: 'kept' } }, { id: 'no', label: 'No', action: { type: 'none', text: '' } }] };

test('changing question type preserves configured option identities and actions', async () => {
  const render = await loadComponent('JevRuleEditor'); let changed;
  const tree = render({ rule, editing: true, writable: true, canSave: true, update: value => { changed = value; } });
  const picker = nodes(tree).find(node => node.type?.name === 'QuestionTypePicker');
  assert.equal(picker.props.value, 'choice');
  picker.props.onChange('score');
  assert.equal(changed.questionType, 'score');
  assert.equal(changed.options, rule.options);
  assert.equal(changed.options[0].action.text, 'kept');
  const candidate = render({ rule: { ...rule, candidateSource: 'custom-list' }, editing: true });
  assert.equal(nodes(candidate).find(node => node.type?.name === 'QuestionTypePicker').props.value, 'noul');
});

test('switching a multi-option rule to yes/no retains its options and prevents save', async () => {
  const render = await loadComponent('JevRuleEditor');
  const current = { ...rule, questionType: 'noul', options: [...rule.options, { id: 'third', label: 'Third', action: { type: 'none', text: '' } }] };
  const tree = render({ rule: current, editing: true, writable: true, canSave: true });
  const modal = nodes(tree).find(node => node.type === 'Modal');
  const save = nodes(modal.props.footer).find(node => node.type === 'Button' && node.props.variant === 'primary');
  assert.equal(save.props.disabled, true);
  assert.equal(current.options.length, 3);
  assert.ok(nodes(tree).some(node => node.props.role === 'alert'));
});

test('the test page sends each chosen question type through the same endpoint', async () => {
  const requests = [];
  const render = await loadComponent('JevTestPage', { fetch: async (url, request) => {
    requests.push({ url, body: JSON.parse(request.body) });
    return { ok: true, json: async () => ({ ok: false, error: 'fixture' }) };
  } });
  const props = { model: { provider: 'fixture', model: 'text' }, onBack() {} };
  for (const questionType of ['choice', 'noul', 'score']) {
    let tree = render(props);
    nodes(tree).find(node => node.type?.name === 'QuestionTypePicker').props.onChange(questionType);
    tree = render(props);
    nodes(tree).find(node => node.type === 'textarea').props.onChange({ currentTarget: { value: 'Test content' } });
    nodes(tree).find(node => node.type === 'Input').props.onChange({ currentTarget: { value: 'Test question' } });
    tree = render(props);
    nodes(tree).find(node => node.type === 'Button' && node.props.variant === 'primary').props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.at(-1).body.questionType, questionType);
    assert.equal(requests.at(-1).url, '/api/dsh-jev-context-gate/test');
  }
});

test('changing model cancels the in-flight test and discards its late result', async () => {
  let requestSignal, resolveRequest;
  const render = await loadComponent('JevTestPage', { fetch: (_url, request) => {
    requestSignal = request.signal; return new Promise(resolve => { resolveRequest = resolve; });
  } });
  const props = { model: { provider: 'fixture', model: 'old' }, onBack() {} };
  let tree = render(props);
  nodes(tree).find(node => node.type === 'textarea').props.onChange({ currentTarget: { value: 'Synthetic' } });
  nodes(tree).find(node => node.type === 'Input').props.onChange({ currentTarget: { value: 'Check?' } });
  tree = render(props);
  nodes(tree).find(node => node.type === 'Button' && node.props.variant === 'primary').props.onClick();
  const next = { ...props, model: { provider: 'fixture', model: 'new' } };
  render(next);
  assert.equal(requestSignal.aborted, true);
  resolveRequest({ ok: true, json: async () => ({ ok: true, value: { questionType: 'choice', question: 'old response', options: [] } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes(render(next)).some(node => node.props['aria-label'] === '测试结果'), false);
});
