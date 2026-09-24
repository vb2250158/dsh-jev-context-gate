import z from '@deepseek-ai/schemastery';

export const SETTINGS_NAMESPACE = 'jev-context-gate';
export const defaultRules = Object.freeze([
  { id: 'investigate-before-claim', enabled: true, title: '先查证据', description: '判断用户请求是否需要先检查证据。', phase: 'before', input: 'latest-user-message', customInput: '', candidateSource: 'none', candidateText: '', candidateScript: '', candidateParameterKey: '',
    splitMode: 'newline', splitText: '', selectionMode: 'top', selectionValue: '10', selectionAction: 'prune', selectionActionText: '',
    questionSource: 'configured', questionScript: '', question: '这项请求是否需要先检查证据，才能判断原因？', threshold: 0.8,
    options: [
      { id: 'yes', label: '是，需要先检查证据', action: { type: 'inject-context', text: '不要仅凭截图或描述猜测根因。先检查相关源码、配置、日志或运行证据；尚未核实的判断要明确标为假设。' } },
      { id: 'no', label: '否，可以直接处理', action: { type: 'none', text: '' } },
    ] },
  { id: 'evidence-after-answer', enabled: true, title: '工具失败提醒', description: '工具返回失败时提醒核对证据。', phase: 'after', input: 'tool-results', customInput: '', candidateSource: 'none', candidateText: '', candidateScript: '', candidateParameterKey: '',
    splitMode: 'newline', splitText: '', selectionMode: 'top', selectionValue: '10', selectionAction: 'prune', selectionActionText: '',
    questionSource: 'configured', questionScript: '', question: '本轮工具结果是否包含失败？', threshold: 0.8,
    options: [
      { id: 'failed', label: '有失败', action: { type: 'append-reminder', text: '提出原因或完成结论前，对照本轮实际收集的证据。证据不足时，明确说明尚未核实；只要存在已获授权的下一步，就继续调查。' } },
      { id: 'success', label: '全部成功', action: { type: 'none', text: '' } },
    ] },
  { id: 'skill-trimming', enabled: true, title: 'Skill 裁剪', description: '按当前上下文的相关度，只向主模型提供最相关的 Skill 简介。', phase: 'skill-catalog', input: 'current-context-text', customInput: '', candidateSource: 'event-params', candidateText: '', candidateScript: '', candidateParameterKey: 'skills',
    questionSource: 'configured', questionScript: '', question: '与当前上下文最相关的 Skill 有哪些？', threshold: 0,
    splitMode: 'newline', splitText: '', selectionMode: 'top', selectionValue: '10', selectionAction: 'prune', selectionActionText: '', options: [] },
]);
export const DEFAULT_SETTINGS = { enabled: false, provider: '', model: '', nativeJev: true, beforeEnabled: true, afterEnabled: true, maxContextCharacters: 12000, maxCorrections: 2, rules: structuredClone(defaultRules) };
const actionSchema = z.object({ type: z.union([z.const('none'), z.const('inject-context'), z.const('inject-skill'), z.const('append-reminder'), z.const('skip-skill'), z.const('keep-top-skills'), z.const('inject-selected-candidates')]).required(), text: z.string().default('') });
const optionSchema = z.object({ id: z.string().required(), label: z.string().required(), action: actionSchema.required() });
const ruleSchema = z.object({
  id: z.string().required(), enabled: z.boolean().default(true), title: z.string().default(''), description: z.string().default(''), phase: z.union([z.const('before'), z.const('after'), z.const('skill-injection'), z.const('skill-catalog')]).required(),
  input: z.string().default(''), customInput: z.string().default(''), questionSource: z.string().default('configured'),
  candidateSource: z.string().default('none'), candidateText: z.string().default(''), candidateScript: z.string().default(''),
  candidateParameterKey: z.string().default(''),
  splitMode: z.string().default('newline'), splitText: z.string().default(''),
  selectionMode: z.string().default(''), selectionValue: z.string().default(''), selectionAction: z.string().default(''), selectionActionText: z.string().default(''),
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
    const input = rule.input || (rule.phase === 'after' ? 'tool-results' : rule.phase === 'skill-injection' ? 'skill-summary' : 'latest-user-message');
    const candidateSource = rule.phase === 'skill-catalog' ? 'event-params' : rule.candidateSource === 'input-lines' ? 'input-split' : rule.candidateSource;
    const legacy = candidateSource === 'none' && rule.options.length === 0;
    const question = legacy && rule.phase === 'after' ? '本轮工具结果是否包含失败？' : rule.question;
    const options = legacy ? (rule.phase === 'before'
      ? [{ id: 'yes', label: '是', action: { type: 'inject-context', text: rule.context } }, { id: 'no', label: '否', action: { type: 'none', text: '' } }]
      : [{ id: 'failed', label: '有失败', action: { type: 'append-reminder', text: rule.context } }, { id: 'success', label: '全部成功', action: { type: 'none', text: '' } }]) : rule.options;
    const candidateParameterKey = rule.candidateParameterKey || (rule.phase === 'skill-catalog' ? 'skills' : '');
    const splitMode = rule.splitMode || 'newline';
    const splitText = rule.splitText;
    const selectionMode = rule.selectionMode || 'top';
    const selectionValue = rule.selectionValue || (candidateSource === 'none' ? '10' : options[0]?.action?.text) || '10';
    const selectionAction = rule.selectionAction || 'prune';
    const selectionActionText = rule.selectionActionText;
    if (!['before', 'after', 'skill-injection', 'skill-catalog'].includes(rule.phase) || (rule.phase === 'before'
      ? !['latest-user-message', 'current-context-text', 'user-message-with-skills', 'custom-text'].includes(input)
      : rule.phase === 'after' ? !['tool-results', 'custom-text'].includes(input)
        : rule.phase === 'skill-injection' ? !['skill-summary', 'skill-content', 'latest-user-message', 'current-context-text', 'custom-text'].includes(input)
          : !['current-context-text', 'latest-user-message', 'custom-text'].includes(input))
      || rule.title.length > 120 || rule.description.length > 500 || rule.customInput.length > 24000 || rule.questionScript.length > 16000 || question.length > 8000
      || !['configured', 'script'].includes(rule.questionSource)
      || (rule.questionSource === 'configured' && !question.trim())
      || (rule.questionSource === 'script' && !rule.questionScript.trim())
      || (input === 'custom-text' && !rule.customInput.trim())
      || !(rule.phase === 'skill-catalog' ? candidateSource === 'event-params' && candidateParameterKey === 'skills' : rule.phase === 'before' ? ['none', 'custom-list', 'input-split', 'script'].includes(candidateSource) : candidateSource === 'none')
      || rule.candidateText.length > 64000 || rule.candidateScript.length > 16000
      || (candidateSource === 'custom-list' && rule.candidateText.split(/\r?\n/).filter(item => item.trim()).length < 2)
      || (candidateSource === 'script' && !rule.candidateScript.trim())
      || !['newline', 'space', 'literal'].includes(splitMode) || splitText.length > 100
      || (candidateSource === 'input-split' && splitMode === 'literal' && !splitText)
      || !['top', 'bottom', 'score-above', 'score-below'].includes(selectionMode)
      || !(selectionMode === 'top' || selectionMode === 'bottom' ? /^[1-9][0-9]*$/.test(selectionValue) && Number.isSafeInteger(Number(selectionValue))
        : /^(?:100(?:\.0+)?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]+)?)$/.test(selectionValue))
      || !['prune', 'inject-extra'].includes(selectionAction) || selectionActionText.length > 8000
      || (candidateSource !== 'none' && selectionAction === 'inject-extra' && !selectionActionText.trim())
      || (candidateSource === 'none' && (options.length < 2 || options.length > 16))) throw new TypeError('Invalid rule');
    if (candidateSource !== 'none' && options.length > 0 && (options.length !== 2
      || options[0].action?.type !== (candidateSource === 'event-params' ? 'keep-top-skills' : 'inject-selected-candidates')
      || options[1].action?.type !== 'none')) throw new TypeError('Invalid legacy selection options');
    const optionIds = new Set(), labels = new Set();
    for (const option of candidateSource === 'none' ? options : []) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(option.id) || optionIds.has(option.id)
        || !option.label.trim() || option.label.length > 800 || labels.has(option.label.trim())
        || !(rule.phase === 'before' ? candidateSource === 'none' ? ['none', 'inject-context', 'inject-skill'] : ['none', 'inject-selected-candidates'] : rule.phase === 'after' ? ['none', 'append-reminder'] : rule.phase === 'skill-injection' ? ['none', 'skip-skill', 'inject-context'] : ['none', 'keep-top-skills']).includes(option.action.type)
        || option.action.text.length > 8000 || (!['none', 'skip-skill'].includes(option.action.type) && !option.action.text.trim())
        || (option.action.type === 'inject-skill' && (option.action.text.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(option.action.text)))) throw new TypeError('Invalid option');
      optionIds.add(option.id); labels.add(option.label.trim());
    }
    if (input === 'user-message-with-skills' && !options.some(option => option.action.type === 'inject-skill')) throw new TypeError('Skill-aware input requires a skill action');
    return { id: rule.id, enabled: rule.enabled, title: rule.title, description: rule.description, phase: rule.phase, input, customInput: rule.customInput,
      candidateSource, candidateText: rule.candidateText, candidateScript: rule.candidateScript, candidateParameterKey,
      splitMode, splitText, selectionMode, selectionValue, selectionAction, selectionActionText,
      questionSource: rule.questionSource, questionScript: rule.questionScript, question, options: candidateSource === 'none' ? options : [], threshold: rule.threshold };
  });
  return { ...value, rules };
};
export const SettingsSchema = z.transform(z.object(fields), normalize, true);
export const Config = z.transform(z.object(fields), normalize, true);
