# dsh-jev-context-gate

English | [简体中文](README.md)

An independent open-source DSH plugin that applies data-driven preflight rules before the main model request and exposes an evidence-aware stream boundary to reduce unsupported guesses. It has no runtime dependency on RabiRoute, Manager, personas, plans or business libraries.

## Status

`0.1.0` is the first development baseline. The rule interpreter, DSH settings namespace, Jev settings page and preview-only test panel exist. A native Jev provider protocol, evidence-backed post-decision classification and full DSH composition acceptance are still in progress and are not reported as complete.

## Design

- **Before** uses public `agent/pre-step` and appends only configured context. Model output cannot become scripts, permissions or arbitrary prompts.
- **After** uses public `llm/stream` as the only replaceable final-answer boundary. `turn-stopping` and `session/event` cannot block text already displayed or committed.
- **Data-driven** rules have an id, phase, question, threshold and preset context. Results only select rules; configured context remains bounded.
- **Jev mode** distinguishes native structured Jev output from generic-model JSON. Generic self-reported probabilities are not automatically called calibrated confidence.

## Settings and test

The Jev page controls before/after stages, context budget and correction limit. The Jev test accepts text and phase and shows a rule preview; by default it never injects into a real session or executes tools. Provider/model selection remains separate from the main session model and will be connected to the DSH model directory in the next implementation step.

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
