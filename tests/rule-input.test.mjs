import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeInput, toolFacts, afterInput } from '../src/rule-input.mjs';

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
