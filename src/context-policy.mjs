export const DEFAULT_CONTEXT_POLICY = Object.freeze({ enabled: true, headroomRatio: 0.06,
  thresholdRatio: 0.8, targetRatio: 0.4, retainRatio: 0.16,
  maxSnapshotCharacters: 12000, catalogDescriptionCharacters: 96, previewItems: 3, detailPageCharacters: 4096 });

/** Snapshot/catalog producers own one current value per kind, plugin and optional contextKey. */
export function contextKey(message) {
  const source = message.source;
  if (!source || !['snapshot', 'catalog'].includes(source.form)) return undefined;
  return JSON.stringify([source.kind, source.plugin ?? '', source.contextKey ?? '', source.form]);
}

const textOf = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
const preview = (value, count) => Array.isArray(value)
  ? value.length > count ? { type: 'array-preview', total: value.length, entries: value.slice(0, count).map(entry => preview(entry, count)) } : value.map(entry => preview(entry, count))
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, preview(entry, count)])) : value;

function sectionPreview(text, count) {
  for (const index of [0, ...Array.from(text.matchAll(/\n(?=[{[])/g), match => match.index + 1)]) {
    try { return text.slice(0, index) + JSON.stringify(preview(JSON.parse(text.slice(index)), count)); }
    catch (_error) { /* A section can contain prose rather than one JSON value. */ }
  }
  return text;
}

/** Preview structured state; unstructured facts stay intact and the original remains addressable. */
export function renderContext(message, sourceSeq, settings) {
  const original = textOf(message);
  const reference = `\n\n完整内容：context_read({"seq":${sourceSeq},"offset":0})；总计 ${original.length} 字符。`;
  if (message.source.form === 'catalog' && Array.isArray(message.source.entries)) {
    const content = message.source.entries.map(entry => `${entry.name}: ${entry.description.slice(0, settings.catalogDescriptionCharacters)}`).join('\n');
    return content.length < original.length ? `可用技能目录；按名称调用 skill 加载正文。\n${content}${reference}` : original;
  }
  if (original.length <= settings.maxSnapshotCharacters) return original;
  const sections = message.source.sections;
  let content = Array.isArray(sections) ? sections.map(section => `[${section.name}]\n${sectionPreview(section.text, settings.previewItems)}`).join('\n\n')
    : sectionPreview(original, settings.previewItems);
  const limit = settings.maxSnapshotCharacters - reference.length;
  if (content.length > limit) return original;
  return content + reference;
}

/** Shared pressure policy uses the actual admitted model, without model-name overrides. */
export function pressurePolicy(contextWindow, reservedCompletionTokens, settings) {
  const messageBudget = contextWindow - reservedCompletionTokens;
  const thresholdTokens = Math.floor(Math.min(contextWindow * settings.thresholdRatio,
    messageBudget - contextWindow * settings.headroomRatio));
  const targetTokens = Math.floor(Math.min(messageBudget * settings.targetRatio, thresholdTokens));
  const retainTokens = Math.floor(messageBudget * settings.retainRatio);
  if (retainTokens < 0 || retainTokens >= targetTokens || targetTokens <= 0) throw new Error('上下文必需预算不足：检查模型容量、输出预留和上下文策略。');
  return { thresholdTokens, targetTokens, retainTokens };
}

/** Log each retirement/re-render immediately after its exact shadow price. */
export function reconcileContext(agent, position, meter, settings, { createUserMessage, createDeveloperMessage }) {
  const session = agent.session;
  const entries = session.surface.nodes.map(seq => ({ seq, event: session.eventAt(seq) }))
    .filter(entry => entry.event?.type === 'user/message' && contextKey(entry.event.data) !== undefined);
  const latest = new Map(entries.map(entry => [contextKey(entry.event.data), entry.seq]));
  let retired = 0, rendered = 0;
  for (const { seq, event } of entries) {
    const message = event.data, key = contextKey(message);
    const previous = message.source.contextPolicy;
    const raw = previous?.sourceSeq === undefined ? message : session.eventAt(previous.sourceSeq)?.data;
    if (!raw?.content) throw new Error(`上下文原文不存在：${previous?.sourceSeq}`);
    let replacement;
    if (latest.get(key) !== seq) {
      replacement = { type: 'developer/message', data: { ...position,
        message: createDeveloperMessage({ content: [], source: { kind: 'plugin:dsh-jev-context-gate' } }) } };
      retired += 1;
    } else if (message.content.every(block => block.type === 'text')) {
      const sourceSeq = previous?.sourceSeq ?? seq;
      const content = renderContext(raw, sourceSeq, settings);
      if (content === textOf(message)) continue;
      replacement = { type: 'user/message', data: createUserMessage({ content: [{ type: 'text', text: content }],
        source: { ...raw.source, contextPolicy: { sourceSeq } } }) };
      rendered += 1;
    } else continue;
    session.append('compaction/prune', { shadowedRange: { start: seq, end: seq },
      shadowedSeqs: [seq], shadowedTokenCount: meter.estimateMessage(message) });
    session.append(replacement.type, replacement.data, { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] });
  }
  return { retired, rendered };
}

/** Read one exact logged context page. The caller supplies its own live session. */
export function readContext(session, args, maximum) {
  const event = session.eventAt(args.seq);
  if (event?.type !== 'user/message' || contextKey(event.data) === undefined) throw new Error('此序号不是当前会话中的可查询上下文。');
  const original = event.data.source.contextPolicy?.sourceSeq;
  const message = original === undefined ? event.data : session.eventAt(original)?.data;
  if (!message?.content) throw new Error('上下文原文不存在。');
  const text = textOf(message), offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length
    || offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1])) throw new Error('无效的上下文分页位置。');
  let end = Math.min(text.length, offset + maximum);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return { seq: original ?? args.seq, offset, totalCharacters: text.length, content: text.slice(offset, end),
    nextOffset: end < text.length ? end : null };
}

/** Install deterministic lifecycle and pressure policies independently of model judgement. */
export function installContextPolicy(ctx, getSettings, builders) {
  const { defineTool } = builders;
  ctx.inject(['agentLoop'], scope => {
    if ((getSettings().contextPolicy ?? DEFAULT_CONTEXT_POLICY).enabled && scope.agentLoop.requestContextVersion !== 1) {
      throw new Error('统一上下文策略需要插件 patches/ 中的宿主补丁；应用并重建后再启用。');
    }
  });
  ctx.on('agent/request-context', async ({ agent, turn, step, signal }, next) => {
    const settings = getSettings().contextPolicy ?? DEFAULT_CONTEXT_POLICY;
    if (settings.enabled) {
      signal.throwIfAborted();
      const meter = ctx.get('tokenMeter');
      if (!meter) throw new Error('上下文策略需要 tokenMeter 服务。');
      const result = reconcileContext(agent, { turn, step }, meter, settings, builders);
      if (result.retired || result.rendered) ctx.logger.info(`context policy: retired=${result.retired}, rendered=${result.rendered}`);
    }
    return next();
  }, { global: true });
  ctx.on('compaction/pressure-policy', (payload, next) => {
    const settings = getSettings().contextPolicy ?? DEFAULT_CONTEXT_POLICY;
    return settings.enabled ? pressurePolicy(payload.contextWindow, payload.reservedCompletionTokens, settings) : next();
  }, { global: true });
  ctx.effect(() => ctx.tools.register(defineTool({ name: 'context_read', description: '按序号读取当前会话中已记录的完整上下文，支持分页。',
    parameters: { seq: { type: 'number', required: true, description: '上下文提供的日志序号。' },
      offset: { type: 'number', description: '上次返回的 nextOffset；首次读取使用 0。' } },
    async execute(args, exec) {
      if (!exec.agent || !Number.isSafeInteger(args.seq) || args.seq < 0) throw new Error('读取上下文需要当前 Agent 和有效序号。');
      const settings = getSettings().contextPolicy ?? DEFAULT_CONTEXT_POLICY;
      const result = readContext(exec.agent.session, args, settings.detailPageCharacters);
      return JSON.stringify(result);
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    presentCall: args => ({ card: 'generic', title: '读取上下文详情', kind: 'read', rawInput: String(args.seq) }),
  })));
}
