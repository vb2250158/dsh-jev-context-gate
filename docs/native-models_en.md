# Native decision models

On 2026-10-30, OpenRouter's [decision catalog](https://openrouter.ai/api/v1/models?output_modalities=decisions) returned 34 entries. The unfiltered `/api/v1/models` endpoint does not include the complete decision catalog. Entries include versions, aliases, free routes, and an extraction model; this count is not a count of independent native decision models.

`src/native-models.json` contains 29 reviewed Decisions entries: 24 concrete models and five latest aliases from 13 makers. Each record carries its sources and question types. This is a compatibility catalog, not a claim that every model has been exercised. Run `node scripts/update-native-models.mjs` to inspect changes. Add `--write` to back up and refresh reviewed names; check each new model's protocol before adding it.

| Maker | Concrete models |
| --- | --- |
| TypeSafe | Jev 1.13, 1.14 |
| OpenAI | GPT-6 Luna Decisions |
| Microsoft | Microsoft-Decision-1 |
| Perplexity | Decider V1.2, Decider Flash V1.2 |
| Cloudflare | Clef, Clef Flash, Clef Omni |
| Baseten | Joey 1, Elephant 1, Mammoth 1 |
| Liquid AI | d1, d1.1, d1-ultra |
| Nace.AI | Drex v1.5, v2.0, Max |
| Respan | Span-02 |
| Inception | Mercury Decide |
| Upstage | Solar Decide, Solar Decide Flash |
| Jared Palmer | Kev 4B |
| ScaleDown | Classify-1 |

These entries use OpenRouter's `POST /api/alpha/decisions` for `choice`, `noul`, and `score`. Direct maker APIs are outside this integration. Model-specific context limits, question limits, and availability still apply. The [GPT-6 Luna Decisions page](https://openrouter.ai/openai/gpt-6-luna-decisions) specifies at most 200 questions per request.

The [official schema](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request) defines an option object for `choice.criteria`, optional true/false descriptions for `noul.criteria`, and an ordered low-to-high array for `score.criteria`. Score is an expected zero-based level index. Choice probabilities and confidence, and Score probabilities, legend, and confidence are optional response fields. Missing fields must not be fabricated as model probabilities.

## Entries needing separate adapters

`docs/native-model-exceptions.json` records five entries that cannot be treated as generic Decisions requests.

- [Clairic](https://openrouter.ai/cloudflare/clairic) uses the Extractions API for typed fields, not these three question types.
- [Tev1](https://openrouter.ai/togethercomputer/tev1-4b-experimental) uses chat completions and returns one letter from 2–24 options, without native probabilities. Encoding boolean or ordinal labels as choices yields a category, not a probability or expected score.
- [Span-01, Lite, and its free route](https://www.respan.ai/docs/apis/gateway/run-span-01) accept an interaction span and behavior definitions, then return present, absent, and not-observable probabilities. They require a separate state adapter; not-observable must not be silently merged into false. Span-02 supports the three question types and is in the generic catalog.

[ScaleDown's API reference](https://docs.scaledown.ai/api-reference/decisions.md) confirms all three types and its state differences: only `state.text` or `state.document` is read, and a string is shorthand for text. Its adapter must preserve the complete input as serialized text. Noul criteria are ignored upstream, so positive and negative descriptions belong in the question instructions. Score accepts 2–10 levels. [Jev Choice](https://docs.typesafe.ai/primitives/choice) supports up to 255 options; splitting mutually exclusive options and merging their probabilities changes their meaning.

Ordinary chat models implement the same three question types through the compatibility adapter; their probabilities are self-reported estimates. A decision-only model must not be sent a chat request merely because it lacks a question type. Use a dedicated adapter or an explicitly configured compatibility model.
