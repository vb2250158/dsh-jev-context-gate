import z from '@deepseek-ai/schemastery';

export const SETTINGS_NAMESPACE = 'jev-context-gate';
export const defaultRules = Object.freeze([
  { id: 'investigate-before-claim', enabled: true, description: '判断用户请求是否需要先检查证据。', phase: 'before', input: 'latest-user-message', customInput: '',
    questionSource: 'configured', questionScript: '', question: '这项请求是否需要先检查证据，才能判断原因？', threshold: 0.8,
    options: [
      { id: 'yes', label: '是，需要先检查证据', action: { type: 'inject-context', text: '不要仅凭截图或描述猜测根因。先检查相关源码、配置、日志或运行证据；尚未核实的判断要明确标为假设。' } },
      { id: 'no', label: '否，可以直接处理', action: { type: 'none', text: '' } },
    ] },
  { id: 'evidence-after-answer', enabled: true, description: '工具返回失败时提醒核对证据。', phase: 'after', input: 'tool-results', customInput: '',
    questionSource: 'configured', questionScript: '', question: '本轮工具结果是否包含失败？', threshold: 0.8,
    options: [
      { id: 'failed', label: '有失败', action: { type: 'append-reminder', text: '提出原因或完成结论前，对照本轮实际收集的证据。证据不足时，明确说明尚未核实；只要存在已获授权的下一步，就继续调查。' } },
      { id: 'success', label: '全部成功', action: { type: 'none', text: '' } },
    ] },
]);
export const DEFAULT_SETTINGS = { enabled: false, provider: '', model: '', nativeJev: true, beforeEnabled: true, afterEnabled: true, maxContextCharacters: 12000, maxCorrections: 2, rules: structuredClone(defaultRules) };
const actionSchema = z.object({ type: z.union([z.const('none'), z.const('inject-context'), z.const('append-reminder')]).required(), text: z.string().default('') });
const optionSchema = z.object({ id: z.string().required(), label: z.string().required(), action: actionSchema.required() });
const ruleSchema = z.object({
  id: z.string().required(), enabled: z.boolean().default(true), description: z.string().default(''), phase: z.union([z.const('before'), z.const('after')]).required(),
  input: z.string().default(''), customInput: z.string().default(''), questionSource: z.string().default('configured'),
  questionScript: z.string().default(''), question: z.string().default(''), options: z.array(optionSchema).default([]),
  threshold: z.number().min(0).max(1).default(0.8), context: z.string().default(''),
});
const fields = {
  enabled: z.boolean().default(false), provider: z.string().default(''), model: z.string().default(''),
  nativeJev: z.boolean().default(true), beforeEnabled: z.boolean().default(true), afterEnabled: z.boolean().default(true),
  maxContextCharacters: z.number().step(1).min(0).max(64000).default(12000),
  maxCorrections: z.number().step(1).min(0).max(8).default(2),
  rules: z.array(ruleSchema).default(structuredClone(defaultRules)),
};
const normalize = value => {
  if (!Array.isArray(value.rules) || value.rules.length > 64) throw new TypeError('Expected at most 64 rules');
  const ids = new Set();
  const rules = value.rules.map(rule => {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(rule.id) || ids.has(rule.id)) throw new TypeError('Invalid or duplicate rule id');
    ids.add(rule.id);
    const legacy = rule.options.length === 0;
    const input = rule.input || (rule.phase === 'before' ? 'latest-user-message' : 'tool-results');
    const question = legacy && rule.phase === 'after' ? '本轮工具结果是否包含失败？' : rule.question;
    const options = legacy ? (rule.phase === 'before'
      ? [{ id: 'yes', label: '是', action: { type: 'inject-context', text: rule.context } }, { id: 'no', label: '否', action: { type: 'none', text: '' } }]
      : [{ id: 'failed', label: '有失败', action: { type: 'append-reminder', text: rule.context } }, { id: 'success', label: '全部成功', action: { type: 'none', text: '' } }]) : rule.options;
    if (!['before', 'after'].includes(rule.phase) || (rule.phase === 'before'
      ? !['latest-user-message', 'current-context-text', 'custom-text'].includes(input)
      : !['tool-results', 'custom-text'].includes(input))
      || rule.description.length > 500 || rule.customInput.length > 24000 || rule.questionScript.length > 16000 || question.length > 8000
      || !['configured', 'script'].includes(rule.questionSource)
      || (rule.questionSource === 'configured' && !question.trim())
      || (rule.questionSource === 'script' && !rule.questionScript.trim())
      || (input === 'custom-text' && !rule.customInput.trim())
      || options.length < 2 || options.length > 16
      || (rule.phase === 'after' && (options.length !== 2 || options[0].id !== 'failed' || options[1].id !== 'success'))) throw new TypeError('Invalid rule');
    const optionIds = new Set(), labels = new Set();
    for (const option of options) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(option.id) || optionIds.has(option.id)
        || !option.label.trim() || option.label.length > 800 || labels.has(option.label.trim())
        || !(rule.phase === 'before' ? ['none', 'inject-context'] : ['none', 'append-reminder']).includes(option.action.type)
        || option.action.text.length > 8000 || (option.action.type !== 'none' && !option.action.text.trim())) throw new TypeError('Invalid option');
      optionIds.add(option.id); labels.add(option.label.trim());
    }
    return { id: rule.id, enabled: rule.enabled, description: rule.description, phase: rule.phase, input, customInput: rule.customInput,
      questionSource: rule.questionSource, questionScript: rule.questionScript, question, options, threshold: rule.threshold };
  });
  return { ...value, rules };
};
export const SettingsSchema = z.transform(z.object(fields), normalize, true);
export const Config = z.transform(z.object(fields), normalize, true);
