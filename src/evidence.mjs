/**
 * Evidence facts are host-produced records, never claims extracted from model text.
 * This guard creates a bounded corrective instruction; it does not veto durable output.
 */
export function validateEvidenceFacts(facts) {
  if (!Array.isArray(facts) || facts.length > 128) throw new TypeError('Invalid evidence facts');
  return facts.map(fact => {
    if (!fact || typeof fact !== 'object' || typeof fact.name !== 'string' || fact.name.length > 128 || typeof fact.ok !== 'boolean') throw new TypeError('Invalid evidence fact');
    return { name: fact.name, ok: fact.ok, ...(typeof fact.summary === 'string' ? { summary: fact.summary.slice(0, 500) } : {}) };
  });
}

export function evidenceCorrection({ answer, facts, maxCharacters = 4000 }) {
  if (typeof answer !== 'string' || answer.length > 24000) throw new TypeError('Invalid candidate answer');
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0 || maxCharacters > 12000) throw new TypeError('Invalid correction budget');
  const valid = validateEvidenceFacts(facts);
  const failed = valid.filter(fact => !fact.ok);
  if (!failed.length) return { status: 'supported', correction: '' };
  const lines = failed.map(fact => `- ${fact.name}: ${fact.summary ?? '未成功，无法作为结论依据。'}`);
  const correction = `候选答复需要证据约束。以下宿主工具事实未成功，不能据此下确定性结论：\n${lines.join('\n')}\n请将相关内容标记为未验证，并优先补充调查。`;
  if (correction.length > maxCharacters) return { status: 'budget-exceeded', correction: '' };
  return { status: 'unsupported', correction };
}
