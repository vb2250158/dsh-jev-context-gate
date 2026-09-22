import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
import { judge } from './judge.mjs';
export { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
export { evaluatePolicy } from './policy.mjs';
export const name = 'dsh-jev-context-gate';
export const inject = ['settings', 'llm'];
const contextMessage = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: name, form: 'instructions' } });

export function apply(ctx, config = {}) {
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: { ...DEFAULT_SETTINGS, ...Config(config) } });
  const runJudge = (settings, phase, input, signal) => judge({ settings, phase, text: input, signal,
    stream: options => ctx.llm.stream(options), createMessage: contextMessage });
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
}
