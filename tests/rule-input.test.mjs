import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeInput, skillInput, toolFacts, afterInput } from '../src/rule-input.mjs';

const user = text => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] });
test('user-message source takes only the latest user message, while context source takes all visible text', () => {
  const messages = [user('旧消息'), { source: { kind: 'assistant' }, content: [{ type: 'text', text: '助手内容' }] }, user('新消息')];
  assert.equal(beforeInput({ input: 'latest-user-message' }, messages), '新消息');
  assert.equal(beforeInput({ input: 'current-context-text' }, messages), '旧消息\n助手内容\n新消息');
  assert.equal(beforeInput({ input: 'custom-text', customInput: '固定文字' }, messages), '固定文字');
});

test('tool-result source includes actual host failure status and text', () => {
  const messages = [{ content: [{ type: 'tool-result', toolCallId: 'tool-1', isError: true,
    content: [{ type: 'text', text: '失败信息' }] }] }];
  const facts = toolFacts(messages);
  assert.deepEqual(facts, [{ id: 'tool-1', failed: true, text: '失败信息' }]);
  assert.match(afterInput({ input: 'tool-results' }, facts), /失败信息/);
  assert.equal(afterInput({ input: 'custom-text', customInput: '固定' }, facts), '固定');
  assert.deepEqual(toolFacts([messages[0], user('下一轮消息')]), []);
});

test('skill-aware source includes only configured model-invocable skill summaries', () => {
  const rule = { input: 'user-message-with-skills', options: [
    { action: { type: 'inject-skill', text: 'code-review' } },
    { action: { type: 'inject-skill', text: 'private-skill' } },
  ] };
  const skills = [
    { name: 'code-review', description: '检查代码', invocation: { modelInvocable: true } },
    { name: 'private-skill', description: '仅用户调用', invocation: { modelInvocable: false } },
    { name: 'other-skill', description: '无关', invocation: { modelInvocable: true } },
  ];
  assert.deepEqual(JSON.parse(beforeInput(rule, [user('审查这段代码')], skills)), {
    userMessage: '审查这段代码', skills: [{ name: 'code-review', description: '检查代码' }],
  });
  assert.equal(beforeInput(rule, [user('审查这段代码')], []), '');
});

test('skill-injection event inputs use the selected skill and configured source', () => {
  const skill = { name: 'code-review', description: '检查代码', content: '完整操作说明' };
  const messages = [user('检查这个改动')];
  assert.deepEqual(JSON.parse(skillInput({ input: 'skill-summary' }, skill, messages)), {
    userMessage: '检查这个改动', skill: { name: 'code-review', description: '检查代码' },
  });
  assert.deepEqual(JSON.parse(skillInput({ input: 'skill-content' }, skill, messages)), { name: 'code-review', content: '完整操作说明' });
  assert.equal(skillInput({ input: 'latest-user-message' }, skill, messages), '检查这个改动');
  assert.equal(skillInput({ input: 'custom-text', customInput: '固定判断内容' }, skill, messages), '固定判断内容');
});
