# dsh-jev-context-gate

English | [简体中文](README.md)

An independent open-source DSH plugin that applies data-driven preflight rules before the main model request and exposes an evidence-aware stream boundary to reduce unsupported guesses. It has no runtime dependency on RabiRoute, Manager, personas, plans or business libraries.

## Status

`0.1.5` fixes browser-side settings-schema rehydration so validation does not depend on a module-local function; `0.1.4` removes the obsolete client runtime injection and unused peer dependencies; `0.1.3` allows the `esbuild` build script during Git package preparation; `0.1.2` disabled automatic peer installation so unpublished DSH peers are not fetched; `0.1.1` fixed an unsupported `schemastery` `enum` API call in the settings schema. The rule interpreter, structured generic-model judge, pre-step injection, DSH settings namespace, Jev settings page, model catalog picker, JSON rule editor and host-evidence correction pure function exist. A native Jev provider protocol, live settings-page model test and full DSH composition acceptance remain in progress. The post-stream boundary adds a bounded reminder only when host `tool-result` facts report failure, while preserving the original stream; it is not an absolute before-display veto.

## Design

- **Before** uses public `agent/pre-step` and appends only configured context. Model output cannot become scripts, permissions or arbitrary prompts.
- **After** uses public `llm/stream` as the only replaceable final-answer boundary. `turn-stopping` and `session/event` cannot block text already displayed or committed.
- **Data-driven** rules have an id, phase, question, threshold and preset context. Results only select rules; configured context remains bounded.
- **Jev mode** distinguishes native structured Jev output from generic-model JSON. Generic self-reported probabilities are not automatically called calibrated confidence.

## Settings and test

The Jev page controls the gate and preflight, selects a separate judge model, and edits JSON rules. Its rule preview lists enabled rules for a phase without calling a model, scoring matches or injecting into a real session. The native Jev protocol is unavailable; the current judge requires generic-model JSON mode.

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
