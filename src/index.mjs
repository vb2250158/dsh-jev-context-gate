import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { escapeText, renderSkillContent } from '@deepseek-ai/dsh-skill';
import { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
import { judge } from './judge.mjs';
import { validateRules } from './policy.mjs';
import { generateQuestion } from './question-script.mjs';
import { beforeInput, toolFacts, afterInput, skillInput } from './rule-input.mjs';
import { testChoice } from './choice-test.mjs';
import { createTestHandler } from './test-route.mjs';
import { resolveSkillRequests } from './skill-injection.mjs';
import { catalogInput, rankCatalog, pruneCatalogMessage } from './catalog-prune.mjs';
import { resolveCandidates } from './candidate-source.mjs';
import { toolRuleInput, matchesTool, composeGroupMessage, sendGroupMessage, startGroupPolling, deliveryIdFor, rabiTimeSeconds } from './tool-automation.mjs';
export { Config, DEFAULT_SETTINGS, SETTINGS_NAMESPACE, SettingsSchema } from './settings.mjs';
export { evaluatePolicy } from './policy.mjs';
export const name = 'dsh-jev-context-gate';
export const inject = ['settings', 'llm', 'skills', 'tools'];
const contextMessage = (text, source = { kind: 'plugin', plugin: name, form: 'instructions' }) => createUserMessage({ content: [{ type: 'text', text }], source });
const selectedText = (rule, selected) => {
  const items = selected.map(entry => `- ${entry.description}`).join('\n');
  return rule.selectionAction === 'inject-extra' ? rule.selectionActionText.replaceAll('{selected}', items)
    : `[${rule.title || rule.id}]\n${items}`;
};

export function apply(ctx, config = {}) {
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: { ...DEFAULT_SETTINGS, ...Config(config) } });
  const internalCalls = new Set();
  const pendingQuestions = new Set();
  const uncertainGroupRules = new Set();
  const pollController = new AbortController();
  ctx.effect(() => () => pollController.abort());
  const runRules = async (settings, phase, inputFor, signal) => {
    const rules = [], inputs = {};
    for (const rule of validateRules(settings.rules).filter(row => row.enabled && row.phase === phase && row.candidateSource === 'none')) {
      const input = await inputFor(rule);
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
  ctx.on('tools/pre-execute', async (exec, next) => {
    const settings = scope.get();
    if (!settings.enabled || internalCalls.has(exec.callId) || !exec.agent || exec.signal.aborted) return next();
    const rules = validateRules(settings.rules).filter(rule => rule.enabled && rule.phase === 'tool-before' && matchesTool(rule, exec.name));
    if (!rules.length) return next();
    try {
      const result = await runRules({ ...settings, rules }, 'tool-before', rule => toolRuleInput(rule, exec, undefined, settings.maxContextCharacters), exec.signal);
      const block = result.decisions?.find(decision => decision.status === 'applied' && decision.action?.type === 'deny-tool');
      if (block) return { kind: 'deny', reason: block.action.text };
    } catch (error) {
      exec.signal.throwIfAborted();
      ctx.logger.warn(`Jev tool-before judgement unavailable for ${exec.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next();
  }, { global: true });
  ctx.on('tools/post-execute', async (exec, toolResult, next) => {
    const decision = await next();
    const settings = scope.get();
    if (!settings.enabled || internalCalls.has(exec.callId) || !exec.agent || exec.signal.aborted || decision.kind === 'block') return decision;
    const rules = validateRules(settings.rules).filter(rule => rule.enabled && rule.phase === 'tool-after' && matchesTool(rule, exec.name));
    if (!rules.length) return decision;
    try {
      const outcome = await runRules({ ...settings, rules }, 'tool-after', rule => toolRuleInput(rule, exec, toolResult, settings.maxContextCharacters), exec.signal);
      const contexts = outcome.context ? [contextMessage(outcome.context)] : [];
      for (const hit of outcome.decisions?.filter(row => row.status === 'applied' && ['notify-group', 'ask-group'].includes(row.action?.type)) ?? []) {
        const rule = rules.find(row => row.id === hit.ruleId);
        if (!rule) continue;
        const key = `${exec.agent.session.id}:${rule.id}`;
        if (uncertainGroupRules.has(key)) continue;
        const question = hit.action.type === 'ask-group';
        if (question && pendingQuestions.has(key)) continue;
        if (question) pendingQuestions.add(key);
        try {
          const eventText = toolRuleInput(rule, exec, toolResult, settings.maxContextCharacters);
          const message = await composeGroupMessage({ ctx, settings, instruction: hit.action.text, eventText, signal: exec.signal, createMessage: contextMessage });
          const sentAt = rabiTimeSeconds(Date.now());
          const receipt = await sendGroupMessage({ ctx, agent: exec.agent, rule, message, deliveryId: deliveryIdFor(exec.agent.session.id, exec.callId, rule.id), signal: exec.signal, internalCalls });
          ctx.logger.info(`Jev ${rule.id} group delivery confirmed: ${receipt.sentMessageId}`);
          if (question) startGroupPolling({ ctx, agent: exec.agent, rule, sentAt, sentMessageId: receipt.sentMessageId, questionText: message, settings, signal: pollController.signal, logger: ctx.logger, internalCalls, createMessage: contextMessage,
            onDone: () => pendingQuestions.delete(key) });
        } catch (error) {
          if (error?.code === 'UNCERTAIN_GROUP_DELIVERY') uncertainGroupRules.add(key);
          else if (question) pendingQuestions.delete(key);
          throw error;
        }
      }
      if (contexts.length) return { ...decision, additionalContexts: [...(decision.additionalContexts ?? []), ...contexts] };
    } catch (error) {
      exec.signal.throwIfAborted();
      ctx.logger.warn(`Jev tool-after action failed for ${exec.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return decision;
  }, { global: true });
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/api/dsh-jev-context-gate/test',
      handler: createTestHandler((input, signal) => testChoice({
        settings: scope.get(), ...input, signal,
        stream: options => ctx.llm.stream(options), createMessage: contextMessage,
      })),
    }));
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/api/dsh-jev-context-gate/tools',
      handler: (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ tools: ctx.tools.schemas().map(tool => tool.name).sort() }));
      },
    }));
  });
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    let decision = await next();
    const settings = scope.get();
    if (decision.kind !== 'enter' || !settings.enabled || signal.aborted) return decision;
    const catalogRules = validateRules(settings.rules).filter(rule => rule.enabled && rule.phase === 'skill-catalog');
    for (const rule of catalogRules) {
      const catalogIndex = decision.messages.findIndex(message => message.source?.kind === 'skill-catalog');
      if (catalogIndex < 0) break;
      const catalog = decision.messages[catalogIndex];
      if (!catalog.source.entries.length) continue;
      const input = catalogInput(rule, agent, decision.messages, settings.maxContextCharacters);
      if (!input) continue;
      try {
        const eventParameters = { skills: catalog.source.entries };
        const candidates = eventParameters[rule.candidateParameterKey];
        if (!Array.isArray(candidates)) throw new Error(`Jev event parameter ${rule.candidateParameterKey} is unavailable`);
        const prepared = await generateQuestion(rule, input, signal, candidates);
        const entries = await rankCatalog({ settings, rule: prepared, entries: candidates, input, signal,
          stream: options => ctx.llm.stream(options), createMessage: contextMessage });
        const messages = [...decision.messages];
        if (rule.selectionAction === 'prune') messages[catalogIndex] = pruneCatalogMessage(catalog, entries, escapeText);
        else if (entries.length) {
          const text = selectedText(rule, entries);
          if (text.length > settings.maxContextCharacters) throw new Error('Selected candidate content exceeds context budget');
          messages.splice(catalogIndex + 1, 0, contextMessage(text));
        }
        decision = { ...decision, messages };
      } catch (error) {
        signal.throwIfAborted();
        ctx.logger.warn(`Jev Skill catalog rule ${rule.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    const selectionRules = validateRules(settings.rules).filter(rule => rule.enabled && rule.phase === 'before' && rule.candidateSource !== 'none');
    for (const rule of selectionRules) {
      const input = catalogInput(rule, agent, decision.messages, settings.maxContextCharacters);
      if (!input) continue;
      try {
        const candidates = await resolveCandidates(rule, input, signal);
        const prepared = await generateQuestion(rule, input, signal, candidates);
        const selected = await rankCatalog({ settings, rule: prepared, entries: candidates, input, signal,
          stream: options => ctx.llm.stream(options), createMessage: contextMessage });
        if (!selected.length) continue;
        const text = selectedText(rule, selected);
        if (text.length > settings.maxContextCharacters) throw new Error('Selected candidate content exceeds context budget');
        const messages = [...decision.messages];
        const explicitSkillIndex = messages.findIndex(message => message.source?.kind === 'skill-invocation');
        messages.splice(explicitSkillIndex < 0 ? messages.length : explicitSkillIndex, 0, contextMessage(text));
        decision = { ...decision, messages };
      } catch (error) {
        signal.throwIfAborted();
        ctx.logger.warn(`Jev candidate rule ${rule.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    if (!settings.rules.some(rule => rule.enabled && rule.phase === 'before' && (rule.candidateSource ?? 'none') === 'none')) return decision;
    try {
      const needsSkillSummaries = settings.rules.some(rule => rule.enabled && rule.phase === 'before' && rule.input === 'user-message-with-skills');
      let snapshot = { skills: [], complete: true };
      if (needsSkillSummaries) {
        try { snapshot = await ctx.skills.snapshot({ cwd: agent.session.header.cwd, signal, scope: agent }); }
        catch (error) {
          signal.throwIfAborted();
          ctx.logger.warn(`Jev skill catalog unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
          snapshot = { skills: [], complete: false };
        }
      }
      const result = await runRules(settings, 'before', rule => beforeInput(rule, decision.messages, snapshot.complete ? snapshot.skills : []), signal);
      signal.throwIfAborted();
      const selected = await resolveSkillRequests({
        requests: result.skillRequests ?? [], existingMessages: decision.messages, skills: ctx.skills, agent, signal,
        maxCharacters: settings.maxContextCharacters, usedCharacters: result.context.length,
        render: renderSkillContent, createMessage: contextMessage,
        beforeInject: settings.rules.some(rule => rule.enabled && rule.phase === 'skill-injection')
          ? async skill => {
            const skillResult = await runRules(settings, 'skill-injection', rule => skillInput(rule, skill, decision.messages), signal);
            if (!skillResult.decisions?.length) throw new Error('Skill injection rules produced no judgement');
            return { skip: skillResult.skipSkill, context: skillResult.context };
          }
          : undefined,
      });
      for (const outcome of selected.outcomes.filter(row => ['skill-unavailable', 'budget-exceeded', 'skill-judgement-unavailable'].includes(row.status)))
        ctx.logger.warn(`Jev skill injection ${outcome.status} for rule ${outcome.ruleId}.`);
      const additions = [...(result.context ? [contextMessage(result.context)] : []), ...selected.messages];
      if (!additions.length) return decision;
      const messages = [...decision.messages];
      const explicitSkillIndex = messages.findIndex(message => message.source?.kind === 'skill-invocation');
      messages.splice(explicitSkillIndex < 0 ? messages.length : explicitSkillIndex, 0, ...additions);
      return { ...decision, messages };
    } catch {
      signal.throwIfAborted();
      ctx.logger.warn('Jev user-message judgement unavailable; no context injected. Check model configuration and test page.');
      return decision;
    }
  }, { global: true, prepend: true });
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
