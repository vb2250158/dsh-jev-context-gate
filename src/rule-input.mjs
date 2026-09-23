/** Read exactly the user-selected text source from the model-visible pre-step messages. */
export function beforeInput(rule, messages) {
  if (rule.input === 'custom-text') return rule.customInput;
  const latest = messages.findLast(message => message.source.kind === 'user');
  const rows = rule.input === 'latest-user-message' ? (latest ? [latest] : []) : messages;
  return rows.flatMap(row => row.content.filter(block => block.type === 'text').map(block => block.text)).join('\n');
}

/** Preserve host tool status and tool text without extracting claims from the model's answer. */
export function toolFacts(messages) {
  const lastUser = messages.findLastIndex(message => message.source?.kind === 'user');
  const currentTurn = lastUser < 0 ? messages : messages.slice(lastUser + 1);
  return currentTurn.flatMap(message => message.content.filter(block => block.type === 'tool-result').map(block => ({
    id: block.toolCallId, failed: block.isError === true,
    text: block.content.filter(item => item.type === 'text').map(item => item.text).join('\n'),
  })));
}

/** A custom value is literal; otherwise the actual tool records become the judgement input. */
export function afterInput(rule, facts) {
  return rule.input === 'custom-text' ? rule.customInput : JSON.stringify(facts);
}
