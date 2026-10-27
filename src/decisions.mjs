import { isNativeSelection } from './mode.mjs';

/** OpenRouter's native typed-decision transport; secrets are resolved on each call. */
export function createDecisionClient(ctx, fetchImpl = fetch) {
  return ({ settings, state, questions, signal }, operation = {}) => {
    const task = async () => {
      const config = settings.decisionApi;
      if (!isNativeSelection(settings)) throw new Error('Select an OpenRouter native Jev model');
      const credential = await ctx.credentials.resolve(config.apiKeyRef);
      if (!credential?.value) throw new Error(`Missing OpenRouter credential: ${config.apiKeyRef}`);
      const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs);
      combined.throwIfAborted();
      const response = await fetchImpl('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { Authorization: `Bearer ${credential.value}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, state, questions }),
      });
      // Provider error bodies can contain request data; expose only the HTTP status.
      if (!response.ok) throw new Error(`OpenRouter Jev HTTP ${response.status}`);
      let result;
      try { result = await response.json(); }
      catch (invalidJson) { throw new Error('Invalid Jev JSON response'); }
      combined.throwIfAborted();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid Jev response');
      validateAnswers(questions, result.answers);
      if (typeof result.model !== 'string' || !result.model) throw new Error('Missing Jev response model');
      return result;
    };
    const timing = ctx.get?.('chatStageTiming');
    return timing?.request?.({ plugin: 'dsh-jev-context-gate', ...operation, provider: settings.provider, model: settings.model,
      transport: 'native-decisions' }, task) ?? task();
  };
}

/** Reject incomplete, refused, or malformed wire answers before any rule action. */
export function validateAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)
    || Object.keys(questions).length !== Object.keys(answers).length) throw new Error('Invalid Jev answers');
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (!answer || answer.type !== question.type) throw new Error('Missing or refused Jev answer');
    if (question.type === 'noul') {
      if (!probability(answer.noul)) throw new Error('Invalid Jev probability');
    } else if (question.type === 'choice') {
      const ids = Object.keys(question.criteria);
      const probabilities = answer.probabilities;
      if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)
        || Object.keys(probabilities).length !== ids.length || !ids.includes(answer.choice)
        || !probability(answer.confidence)
        || ids.some(key => !Object.hasOwn(probabilities, key) || !probability(probabilities[key]))
        || Math.abs(ids.reduce((sum, key) => sum + probabilities[key], 0) - 1) > 0.02) throw new Error('Invalid Jev choice');
    } else throw new Error('Unsupported Jev question type');
  }
}

const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
