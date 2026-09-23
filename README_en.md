# dsh-jev-context-gate

English | [简体中文](README.md)

An independent open-source DSH plugin that applies data-driven preflight rules before the main model request and exposes an evidence-aware stream boundary to reduce unsupported guesses. It has no runtime dependency on RabiRoute, Manager, personas, plans or business libraries.

## Status

`0.1.6` translates default rules into Chinese and replaces the JSON editor and preview with collapsible rule cards; `0.1.5` fixed browser-side settings-schema validation. The rule interpreter, structured generic-model judge, pre-step injection, DSH settings namespace, Jev settings page, model catalog picker, rule form and host-evidence correction pure function exist. A native Jev provider protocol, live settings-page model test and full DSH composition acceptance remain in progress. The post-stream boundary adds a bounded reminder only when host `tool-result` facts report failure, while preserving the original stream; it is not an absolute before-display veto.

## Design

- **Before** uses public `agent/pre-step` and appends only configured context. Model output cannot become scripts, permissions or arbitrary prompts.
- **After** uses public `llm/stream` as the only replaceable final-answer boundary. `turn-stopping` and `session/event` cannot block text already displayed or committed.
- **Data-driven** rules have an id, phase, question, threshold and preset context. Results only select rules; configured context remains bounded.
- **Jev mode** distinguishes native structured Jev output from generic-model JSON. Generic self-reported probabilities are not automatically called calibrated confidence.

## Settings and test

The Jev page controls the gate and preflight, selects a separate judge model, and edits each rule's enabled state, phase, question, injected context, and percentage threshold in a card. Rule changes require Save; Discard restores the saved version. Post rules are marked as not yet active. The rule list shows configuration without calling a model, scoring matches, or injecting into a real session. The native Jev protocol is unavailable; the current judge requires generic-model mode.

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
