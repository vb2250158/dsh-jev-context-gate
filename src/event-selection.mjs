import { normalizeCandidates } from './candidate-source.mjs';
import { generateQuestion } from './question-script.mjs';
import { rankCatalog } from './catalog-prune.mjs';

/** Select an event-supplied candidate array without mutating the provider's input. */
export async function selectEventCandidates({ settings, rule, parameters, input, signal, stream, createMessage }) {
  const candidates = normalizeCandidates(parameters[rule.candidateParameterKey]);
  const prepared = await generateQuestion(rule, input, signal, candidates);
  const selected = await rankCatalog({ settings, rule: prepared, entries: candidates, input, signal, stream, createMessage });
  return selected.map(entry => ({ id: entry.name, text: entry.description }));
}
