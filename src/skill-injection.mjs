const skillSourcePrefix = 'dsh-jev-context-gate/skill/';

/** Read skills whose complete bodies remain visible in the durable session. */
export function visibleSkillNames(agent) {
  const names = new Set();
  for (const seq of agent.session.surface.nodes) {
    const event = agent.session.eventAt(seq);
    if (event?.type !== 'user/message') continue;
    const source = event.data.source;
    if (source?.kind === 'skill-invocation') names.add(source.name);
    if (source?.kind === 'plugin' && source.plugin?.startsWith(skillSourcePrefix)) names.add(source.plugin.slice(skillSourcePrefix.length));
  }
  return names;
}

/** Load only model-invocable skills selected by rules, within the shared context budget. */
export async function resolveSkillRequests({ requests, existingMessages, skills, agent, signal, maxCharacters, usedCharacters, render, createMessage, beforeInject }) {
  const loadedNames = visibleSkillNames(agent);
  for (const message of existingMessages) {
    if (message.source?.kind === 'skill-invocation') loadedNames.add(message.source.name);
  }
  const messages = [], outcomes = [];
  let used = usedCharacters;
  const lookup = { cwd: agent.session.header.cwd, signal, scope: agent };
  for (const request of requests) {
    signal.throwIfAborted();
    if (loadedNames.has(request.name)) {
      outcomes.push({ ruleId: request.ruleId, status: 'already-loaded' });
      continue;
    }
    let skill;
    try { skill = await skills.get(request.name, lookup); }
    catch (error) {
      signal.throwIfAborted();
      outcomes.push({ ruleId: request.ruleId, status: 'skill-unavailable', error });
      continue;
    }
    signal.throwIfAborted();
    if (!skill?.invocation?.modelInvocable) {
      outcomes.push({ ruleId: request.ruleId, status: 'skill-unavailable' });
      continue;
    }
    let gate = { skip: false, context: '' };
    if (beforeInject) {
      try { gate = await beforeInject(skill, request); }
      catch (error) {
        signal.throwIfAborted();
        outcomes.push({ ruleId: request.ruleId, status: 'skill-judgement-unavailable', error });
        continue;
      }
      if (gate.skip) {
        outcomes.push({ ruleId: request.ruleId, status: 'skipped-by-rule' });
        continue;
      }
    }
    let content;
    try { content = render(skill); }
    catch (error) {
      outcomes.push({ ruleId: request.ruleId, status: 'skill-unavailable', error });
      continue;
    }
    const text = `Jev 已根据规则选择并加载 Skill ${skill.name}。本轮请直接遵循下方内容，无需再次调用 skill 工具加载同名 Skill。\n${content}${gate.context ? `\n${gate.context}` : ''}`;
    if (used + text.length > maxCharacters) {
      outcomes.push({ ruleId: request.ruleId, status: 'budget-exceeded' });
      continue;
    }
    messages.push(createMessage(text, { kind: 'plugin', plugin: `${skillSourcePrefix}${skill.name}`, form: 'instructions' }));
    loadedNames.add(request.name);
    used += text.length;
    outcomes.push({ ruleId: request.ruleId, status: 'applied' });
  }
  return { messages, outcomes };
}
