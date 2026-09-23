const fixedToolQuestion = '本轮工具结果是否包含失败？';

/** Convert saved legacy rules into option-owned actions and validate every executable field. */
export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 64) throw new TypeError('Expected at most 64 rules');
  const ids = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(rule.id) || ids.has(rule.id)) throw new TypeError('Invalid or duplicate rule id');
    ids.add(rule.id);
    if (!['before', 'after'].includes(rule.phase) || typeof rule.enabled !== 'boolean') throw new TypeError('Invalid rule event');
    const description = rule.description ?? '';
    if (typeof description !== 'string' || description.length > 500) throw new TypeError('Invalid rule description');
    const input = rule.input || (rule.phase === 'before' ? 'latest-user-message' : 'tool-results');
    if (rule.phase === 'before' ? !['latest-user-message', 'current-context-text', 'custom-text'].includes(input) : !['tool-results', 'custom-text'].includes(input)) throw new TypeError('Invalid rule input');
    const customInput = rule.customInput ?? '';
    if (typeof customInput !== 'string' || customInput.length > 24000 || (input === 'custom-text' && !customInput.trim())) throw new TypeError('Invalid custom input');
    const questionSource = rule.questionSource || 'configured';
    const questionScript = rule.questionScript ?? '';
    if (!['configured', 'script'].includes(questionSource) || typeof questionScript !== 'string' || questionScript.length > 16000 || (questionSource === 'script' && !questionScript.trim())) throw new TypeError('Invalid question source');
    const legacy = !Array.isArray(rule.options) || rule.options.length === 0;
    const question = rule.phase === 'after' && legacy ? fixedToolQuestion : rule.question;
    if (typeof question !== 'string' || (questionSource === 'configured' && !question.trim()) || question.length > 8000) throw new TypeError('Invalid question');
    if (!Number.isFinite(rule.threshold) || rule.threshold < 0 || rule.threshold > 1) throw new TypeError('Invalid threshold');
    const options = Array.isArray(rule.options) && rule.options.length ? rule.options :
      rule.phase === 'before'
        ? [{ id: 'yes', label: '是', action: { type: 'inject-context', text: rule.context } }, { id: 'no', label: '否', action: { type: 'none', text: '' } }]
        : [{ id: 'failed', label: '有失败', action: { type: 'append-reminder', text: rule.context } }, { id: 'success', label: '全部成功', action: { type: 'none', text: '' } }];
    if (options.length < 2 || options.length > 16 || (rule.phase === 'after' && (options.length !== 2 || options[0].id !== 'failed' || options[1].id !== 'success'))) throw new TypeError('Invalid options');
    const optionIds = new Set(), labels = new Set();
    const validOptions = options.map(option => {
      if (!option || typeof option.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(option.id) || optionIds.has(option.id)
        || typeof option.label !== 'string' || !option.label.trim() || option.label.length > 800 || labels.has(option.label.trim())) throw new TypeError('Invalid option');
      optionIds.add(option.id); labels.add(option.label.trim());
      const action = option.action;
      const validTypes = rule.phase === 'before' ? ['none', 'inject-context'] : ['none', 'append-reminder'];
      if (!action || !validTypes.includes(action.type) || typeof action.text !== 'string' || action.text.length > 8000 || (action.type !== 'none' && !action.text.trim())) throw new TypeError('Invalid option action');
      return { id: option.id, label: option.label, action: { type: action.type, text: action.type === 'none' ? '' : action.text } };
    });
    return { id: rule.id, enabled: rule.enabled, description, phase: rule.phase, input, customInput, questionSource, questionScript, question, options: validOptions, threshold: rule.threshold };
  });
}

/** Select the highest-scored option; only its configured action can affect the session. */
export function evaluatePolicy({ rules, phase, verdicts, maxCharacters = 12000 }) {
  const valid = validateRules(rules);
  if (!['before', 'after'].includes(phase)) throw new TypeError('Invalid phase');
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0 || maxCharacters > 64000) throw new TypeError('Invalid context budget');
  const decisions = [], chunks = [];
  let length = 0;
  for (const rule of valid.filter(row => row.enabled && row.phase === phase)) {
    const scores = verdicts?.[rule.id]?.probabilities;
    if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).length !== rule.options.length
      || rule.options.some(option => !Object.hasOwn(scores, option.id) || !Number.isFinite(scores[option.id]) || scores[option.id] < 0 || scores[option.id] > 1)) {
      decisions.push({ ruleId: rule.id, status: 'invalid-result' }); continue;
    }
    const total = rule.options.reduce((sum, option) => sum + scores[option.id], 0);
    if (Math.abs(total - 1) > 0.02) { decisions.push({ ruleId: rule.id, status: 'invalid-result' }); continue; }
    const selected = rule.options.reduce((best, option) => scores[option.id] > scores[best.id] ? option : best);
    const score = scores[selected.id] / total;
    if (score < rule.threshold) { decisions.push({ ruleId: rule.id, optionId: selected.id, status: 'below-threshold', score }); continue; }
    if (selected.action.type === 'none') { decisions.push({ ruleId: rule.id, optionId: selected.id, status: 'no-action', score }); continue; }
    const text = `[${rule.id} · ${selected.label}]\n${selected.action.text}`;
    const added = text.length + (chunks.length ? 2 : 0);
    if (length + added > maxCharacters) { decisions.push({ ruleId: rule.id, optionId: selected.id, status: 'budget-exceeded', score }); continue; }
    chunks.push(text); length += added;
    decisions.push({ ruleId: rule.id, optionId: selected.id, status: 'applied', score });
  }
  return { decisions, context: chunks.join('\n\n') };
}
