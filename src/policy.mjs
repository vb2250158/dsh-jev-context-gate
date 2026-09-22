/** Deterministic policy interpreter. Model results cannot supply executable actions. */
export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 64) throw new TypeError('Expected at most 64 rules');
  const ids = new Set();
  for (const rule of rules) {
    if (!rule || typeof rule.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(rule.id) || ids.has(rule.id)) throw new TypeError('Invalid or duplicate rule id');
    ids.add(rule.id);
    if (!['before', 'after'].includes(rule.phase)) throw new TypeError('Invalid phase');
    if (typeof rule.enabled !== 'boolean') throw new TypeError('Expected enabled boolean');
    for (const key of ['question', 'context']) if (typeof rule[key] !== 'string' || !rule[key].trim() || rule[key].length > 8000) throw new TypeError(`Invalid ${key}`);
    if (!Number.isFinite(rule.threshold) || rule.threshold < 0 || rule.threshold > 1) throw new TypeError('Invalid threshold');
  }
  return structuredClone(rules);
}

/** confidence is provider metadata, not an independent truth or permission. */
export function evaluatePolicy({ rules, phase, verdicts, maxCharacters = 12000 }) {
  const valid = validateRules(rules);
  if (!['before', 'after'].includes(phase)) throw new TypeError('Invalid phase');
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0 || maxCharacters > 64000) throw new TypeError('Invalid context budget');
  const decisions = [];
  const chunks = [];
  let length = 0;
  for (const rule of valid.filter(row => row.enabled && row.phase === phase)) {
    const verdict = verdicts?.[rule.id];
    const score = verdict?.matchProbability;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      decisions.push({ ruleId: rule.id, status: 'invalid-result' });
      continue;
    }
    if (score < rule.threshold) {
      decisions.push({ ruleId: rule.id, status: 'not-matched', score });
      continue;
    }
    const text = `[${rule.id}]\n${rule.context}`;
    const added = text.length + (chunks.length ? 2 : 0);
    if (length + added > maxCharacters) {
      decisions.push({ ruleId: rule.id, status: 'budget-exceeded', score });
      continue;
    }
    chunks.push(text);
    length += added;
    decisions.push({ ruleId: rule.id, status: 'injected', score });
  }
  return { decisions, context: chunks.join('\n\n') };
}
