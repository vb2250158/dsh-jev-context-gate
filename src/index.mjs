import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
import { judge } from './judge.mjs';
import { validateRules } from './policy.mjs';
import { generateQuestion } from './question-script.mjs';
import { beforeInput, toolFacts, afterInput } from './rule-input.mjs';
import { testChoice } from './choice-test.mjs';
import { createTestHandler } from './test-route.mjs';
export { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
export { evaluatePolicy } from './policy.mjs';
export const name = 'dsh-jev-context-gate';
export const inject = ['settings', 'llm'];
const contextMessage = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: name, form: 'instructions' } });

export function apply(ctx, config = {}) {
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: { ...DEFAULT_SETTINGS, ...Config(config) } });
  const runRules = async (settings, phase, inputFor, signal) => {
    const rules = [], inputs = {};
    for (const rule of validateRules(settings.rules).filter(row => row.enabled && row.phase === phase)) {
      const input = inputFor(rule);
      if (!input) continue;
      try {
        rules.push(await generateQuestion(rule, input, signal));
        inputs[rule.id] = input;
      } catch (error) {
        ctx.logger.warn(`Jev question script failed for ${rule.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    if (!rules.length) return { context: '' };
    return judge({ settings, phase, inputs, preparedRules: rules, signal,
      stream: options => ctx.llm.stream(options), createMessage: contextMessage });
  };
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/api/dsh-jev-context-gate/test',
      handler: createTestHandler((input, signal) => testChoice({
        settings: scope.get(), ...input, signal,
        stream: options => ctx.llm.stream(options), createMessage: contextMessage,
      })),
    }));
  });
  ctx.on('agent/pre-step', async ({ signal }, next) => {
    const decision = await next();
    const settings = scope.get();
    if (decision.kind !== 'enter' || !settings.enabled || !settings.rules.some(rule => rule.enabled && rule.phase === 'before') || signal.aborted) return decision;
    try {
      const result = await runRules(settings, 'before', rule => beforeInput(rule, decision.messages), signal);
      signal.throwIfAborted();
      return result.context ? { ...decision, messages: [...decision.messages, contextMessage(result.context)] } : decision;
    } catch {
      signal.throwIfAborted();
      ctx.logger.warn('Jev user-message judgement unavailable; no context injected. Check model configuration and test page.');
      return decision;
    }
  }, { global: true });
  ctx.on('llm/stream', (options, next) => {
    const settings = scope.get();
    const afterRules = settings.rules.filter(rule => rule.enabled && rule.phase === 'after');
    if (!settings.enabled || !afterRules.length || options.purpose !== undefined) return next();
    const facts = toolFacts(options.messages);
    if (!facts.length) return next();
    const upstream = next();
    return (async function* () {
      const chunks = [];
      for await (const chunk of upstream) chunks.push(chunk);
      try {
        const signal = options.signal ?? new AbortController().signal;
        const result = await runRules(settings, 'after', rule => afterInput(rule, facts), signal);
        if (result.context) {
          const text = result.context;
          let inserted = false;
          for (const chunk of chunks) {
            if (chunk.type === 'finish' && !inserted) {
              const index = chunks.reduce((max, row) => Math.max(max, 'index' in row ? row.index : -1), -1) + 1;
              yield { type: 'block-start', index, blockType: 'text' };
              yield { type: 'text-delta', index, text };
              yield { type: 'block-end', index, block: { type: 'text', text } };
              inserted = true;
            }
            yield chunk;
          }
          return;
        }
      } catch (error) { ctx.logger.warn(`Jev tool-result judgement unavailable; original stream preserved: ${error instanceof Error ? error.message : 'unknown error'}`); }
      for (const chunk of chunks) yield chunk;
    })();
  });
}
