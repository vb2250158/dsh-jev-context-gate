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
    const candidate = `当前目录（${message.source.kind}），替代同来源与上下文键的旧版本。\n${content}${reference}`;
    return candidate.length < original.length ? candidate : original;
  }
  if (original.length <= settings.maxSnapshotCharacters) return original;
  const sections = message.source.sections;
  let content = Array.isArray(sections) ? sections.map(section => `[${section.name}]\n${sectionPreview(section.text, settings.previewItems)}`).join('\n\n')
    : sectionPreview(original, settings.previewItems);
  const heading = '当前状态快照，替代同来源与上下文键的旧版本。\n';
  const limit = settings.maxSnapshotCharacters - reference.length - heading.length;
  if (content.length > limit) return original;
  return heading + content + reference;
}

/** Resolve an original only within its session; copied views carry their complete captured text. */
function originalContext(session, seq, message, joinContextSections) {
  const previous = message.source.contextPolicy;
  if (!previous) return { raw: message, sourceSeq: seq };
  const local = previous.sessionId === undefined || previous.sessionId === session.id;
  const event = local ? session.eventAt(previous.sourceSeq) : undefined;
  const matching = event?.type === 'user/message' && contextKey(event.data) === contextKey(message);
  const sourceSeq = matching ? previous.sourceSeq : seq;
  if (matching && !event.data.source.contextPolicy) return { raw: event.data, sourceSeq };
  const originalText = typeof previous.originalText === 'string' ? previous.originalText
    : message.source.kind === 'runtime-context' && Array.isArray(message.source.sections) && joinContextSections
      ? joinContextSections(message.source.sections) : undefined;
  if (originalText !== undefined) {
    const { contextPolicy: _previous, ...source } = message.source;
    return { raw: { ...message, source, content: [{ type: 'text', text: originalText }] }, sourceSeq };
  }
  return { raw: undefined, sourceSeq };
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
export function reconcileContext(agent, position, meter, settings, { createUserMessage, createDeveloperMessage, joinContextSections }) {
  const session = agent.session;
  const entries = session.surface.nodes.map(seq => ({ seq, event: session.eventAt(seq) }))
    .filter(entry => entry.event?.type === 'user/message' && contextKey(entry.event.data) !== undefined);
  const latest = new Map();
  for (const entry of entries) {
    const key = contextKey(entry.event.data);
    const version = originalContext(session, entry.seq, entry.event.data).sourceSeq;
    if (!latest.has(key) || version > latest.get(key).version) latest.set(key, { seq: entry.seq, version });
  }
  let retired = 0, rendered = 0;
  for (const { seq, event } of entries) {
    const message = event.data, key = contextKey(message);
    const previous = message.source.contextPolicy;
    let replacement;
    if (latest.get(key).seq !== seq) {
      replacement = { type: 'developer/message', data: { ...position,
        message: createDeveloperMessage({ content: [], source: { kind: 'plugin:dsh-jev-context-gate' } }) } };
      retired += 1;
    } else if (message.content.every(block => block.type === 'text')) {
      const { raw, sourceSeq } = originalContext(session, seq, message, joinContextSections);
      // Legacy copied views without their original remain visible until the producer refreshes.
      if (!raw) continue;
      const content = renderContext(raw, sourceSeq, settings);
      const structuredRuntime = raw.source.kind === 'runtime-context' && Array.isArray(raw.source.sections) && joinContextSections;
      if (content === textOf(message) && (!previous || (previous.originalText !== undefined || structuredRuntime)
        && previous.sessionId === session.id)) continue;
      replacement = { type: 'user/message', data: createUserMessage({ content: [{ type: 'text', text: content }],
        source: { ...raw.source, contextPolicy: { sourceSeq, ...(structuredRuntime ? {} : {originalText: textOf(raw)}),
          ...(session.id === undefined ? {} : { sessionId: session.id }) } } }) };
      rendered += 1;
    } else continue;
    session.append('compaction/prune', { shadowedRange: { start: seq, end: seq },
      shadowedSeqs: [seq], shadowedTokenCount: meter.estimateMessage(message) });
    session.append(replacement.type, replacement.data, { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] });
  }
  return { retired, rendered };
}

/** Read one exact logged context page. The caller supplies its own live session. */
export function readContext(session, args, maximum, { joinContextSections } = {}) {
  const event = session.eventAt(args.seq);
  if (event?.type !== 'user/message' || contextKey(event.data) === undefined) throw new Error('此序号不是当前会话中的可查询上下文。');
  const { raw: message, sourceSeq } = originalContext(session, args.seq, event.data, joinContextSections);
  if (!message) throw new Error('源全文不在当前会话；请刷新该来源的上下文后读取。');
  const text = textOf(message), offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length
    || offset > 0 && /[\uD800-\uDBFF]/.test(text[offset - 1])) throw new Error('无效的上下文分页位置。');
  let end = Math.min(text.length, offset + maximum);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  return { seq: sourceSeq, offset, totalCharacters: text.length, content: text.slice(offset, end),
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
      const result = readContext(exec.agent.session, args, settings.detailPageCharacters, builders);
      return JSON.stringify(result);
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    presentCall: args => ({ card: 'generic', title: '读取上下文详情', kind: 'read', rawInput: String(args.seq) }),
  })));
}
