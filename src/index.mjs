import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
import { judge } from './judge.mjs';
import { evidenceCorrection } from './evidence.mjs';
export { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
export { evaluatePolicy } from './policy.mjs';
export const name = 'dsh-jev-context-gate';
export const inject = ['settings', 'llm'];
const contextMessage = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: name, form: 'instructions' } });

export function apply(ctx, config = {}) {
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: { ...DEFAULT_SETTINGS, ...Config(config) } });
  const runJudge = (settings, phase, input, signal) => judge({ settings, phase, text: input, signal,
    stream: options => ctx.llm.stream(options), createMessage: contextMessage });
  const evidenceFacts = options => options.messages.flatMap(message => message.content.filter(block => block.type === 'tool-result').map(block => ({
    name: block.toolCallId, ok: block.isError !== true, summary: block.isError === true ? '工具结果标记为失败。' : '工具结果已记录。',
  })));
  ctx.on('agent/pre-step', async ({ signal }, next) => {
    const decision = await next();
    const settings = scope.get();
    if (decision.kind !== 'enter' || !settings.enabled || !settings.beforeEnabled || signal.aborted) return decision;
    const input = decision.messages.filter(row => row.source.kind === 'user').flatMap(row => row.content.filter(block => block.type === 'text').map(block => block.text)).join('\n');
    if (!input) return decision;
    try {
      const result = await runJudge(settings, 'before', input, signal);
      signal.throwIfAborted();
      return result.context ? { ...decision, messages: [...decision.messages, contextMessage(result.context)] } : decision;
    } catch {
      signal.throwIfAborted();
      ctx.logger.warn('Jev preflight unavailable; no context injected. Check model configuration and test panel.');
      return decision;
    }
  }, { global: true });
  ctx.on('llm/stream', (options, next) => {
    const settings = scope.get();
    if (!settings.enabled || !settings.afterEnabled || options.purpose !== undefined) return next();
    const facts = evidenceFacts(options);
    if (!facts.some(fact => !fact.ok)) return next();
    const upstream = next();
    return (async function* () {
      const chunks = []; let answer = '';
      for await (const chunk of upstream) { chunks.push(chunk); if (chunk.type === 'text-delta') answer += chunk.text; }
      try {
        const result = evidenceCorrection({ answer, facts, maxCharacters: settings.maxContextCharacters });
        if (result.status === 'unsupported' && result.correction) {
          let inserted = false;
          for (const chunk of chunks) {
            if (!inserted && chunk.type === 'text-delta') { yield { ...chunk, text: `${chunk.text}\n\n[证据约束]\n${result.correction}` }; inserted = true; }
            else yield chunk;
          }
          return;
        }
      } catch (error) { ctx.logger.warn(`Jev evidence correction unavailable; original stream preserved: ${error instanceof Error ? error.message : 'unknown error'}`); }
      for (const chunk of chunks) yield chunk;
    })();
  });
}
