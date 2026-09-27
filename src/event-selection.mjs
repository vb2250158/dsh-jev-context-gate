import { normalizeCandidates } from './candidate-source.mjs';
import { generateQuestion } from './question-script.mjs';
import { rankCatalog } from './catalog-prune.mjs';

/** Select an event-supplied candidate array without mutating the provider's input. */
export async function selectEventCandidates({ settings, rule, parameters, input, signal, stream, createMessage }) {
  const candidates = normalizeCandidates(parameters[rule.candidateParameterKey], 1);
  const prepared = await generateQuestion(rule, input, signal, candidates);
  const selected = await rankCatalog({ settings, rule: prepared, entries: candidates, input, signal, stream, createMessage });
  return selected.map(entry => ({ id: entry.name, text: entry.description }));
}

/** Return selected entries to the provider, replacing its parameter only for pruning. */
export function applyEventSelection(parameters, rule, selected) {
  return {
    parameters: rule.selectionAction === 'prune' ? { ...parameters, [rule.candidateParameterKey]: selected } : parameters,
    selection: { ruleId: rule.id, parameterKey: rule.candidateParameterKey, selected },
  };
}
