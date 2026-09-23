# dsh-jev-context-gate

English | [简体中文](README.md)

An independent open-source DSH plugin that applies data-driven preflight rules before the main model request and exposes an evidence-aware stream boundary to reduce unsupported guesses. It has no runtime dependency on RabiRoute, Manager, personas, plans or business libraries.

## Status

`0.1.8` reads DSH's `finish.reason.kind` to recognize successful model completion, fixing a false failure in live tests.

`0.1.7` adds an ordinary-model Choice test showing the question, options, option probabilities, and a distribution-concentration result. Model IDs automatically select Jev native or LLM JSON simulation; the manual mode switch is gone. `0.1.6` translated default rules into Chinese and replaced the JSON editor with rule cards. The rule interpreter, ordinary-model judge, pre-step injection, DSH settings namespace, model picker, rule form, and host-evidence correction pure function exist. Native Jev structured calls still require a provider adapter; ordinary-model testing uses a configured DSH model. The post-stream boundary adds a bounded reminder only when host `tool-result` facts report failure, while preserving the original stream; it is not an absolute before-display veto.

## Design

- **Before** uses public `agent/pre-step` and appends only configured context. Model output cannot become scripts, permissions or arbitrary prompts.
- **After** uses public `llm/stream` as the only replaceable final-answer boundary. `turn-stopping` and `session/event` cannot block text already displayed or committed.
- **Data-driven** rules have an id, phase, question, threshold and preset context. Results only select rules; configured context remains bounded.
- **Jev mode** distinguishes native structured Jev output from generic-model JSON. Generic self-reported probabilities are not automatically called calibrated confidence.

## Settings and test

The Jev page first selects a judge model, then accepts state text, one question, and 2–16 options. An ordinary-model test calls that model and displays each estimated option probability, the selected option, and a concentration metric computed from the distribution. This metric is not Jev's calibrated confidence. IDs beginning with `jev-` are automatically labeled native; native structured calls await the provider adapter and are never simulated as ordinary model calls. The page also controls the gate and preflight and edits each rule's enabled state, phase, question, injected context, and percentage threshold in a card. Rule changes require Save; Discard restores the saved version. Post rules are marked as not yet active.

## Development

```powershell
npm test
npm run build
npm run check
npm pack --dry-run
```

Test and build before publication, then stage all files, commit, tag, push branch and tag, verify the remote SHA, and only then update the DSH private manifest. Never use `link:`, `file:` or `workspace:` as an installation source.

## Limitations

This is an assistive gate, not a fact verifier. Without source, configuration, logs or runtime reproduction it can constrain wording and request investigation, but cannot prove a model conclusion correct.

## License

MIT
