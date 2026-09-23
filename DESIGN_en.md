# Jev Rule Design

English | [简体中文](DESIGN.md)

## Data and execution

DSH settings owns saved rules. A rule stores a stable ID, enabled state, editable description, event, input source, optional fixed input, question source, title or script, probability threshold, and 2–16 options with stable IDs, labels, and actions. Existing `phase/question/context/threshold` rules migrate when settings are read. Legacy `beforeEnabled/afterEnabled` fields remain readable; enabled rules control runtime.

The `before` event reads the latest user text or text visible at `agent/pre-step` and appends the selected option's context before the main model request. The `after` event reads host tool-result IDs, failure status, and text at `llm/stream`; it buffers the original stream and appends the selected reminder before `finish`. It cannot retract content already displayed. Fixed custom input is used verbatim when its event occurs.

A question script is trusted JavaScript saved in settings. It runs in a separate Node worker with a five-second timeout and 64 MiB old-generation limit. It can read files through Node APIs. It receives event, input, and option IDs/default labels and may return only a title and labels for those same IDs. The policy interpreter reads actions exclusively from saved rules, never from model or script output.

An ordinary model returns JSON probabilities for every option of every active rule. IDs, ranges, and sums are validated. Only the highest-probability option above threshold acts, in rule order and within the context budget. Failures preserve the original decision or stream. Native Jev models are identified by model ID and reject the ordinary JSON path until a provider adapter exists.

## UI and testing

Rule settings contain one master switch, a judge-model picker, and compact four-stage rule editing. The collapsed card shows its description, while detailed help expands on demand. Dynamic sources describe the exact runtime content; script mode states that the title and labels are generated at runtime. Actions and parameters belong to options. A separate test view within the settings section runs a disposable Choice request without changing a session. Ordinary models show option probabilities and distribution concentration, not calibrated confidence.

## Acceptance

Check legacy migration, browser schema serialization, input sources, script file access and output restrictions, option actions, probability validation, context budget, build, pinned installation, installed artifacts, restarted DSH process, and real browser interaction.
