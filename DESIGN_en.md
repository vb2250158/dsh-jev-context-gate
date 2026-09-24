# Jev Rule Design

English | [简体中文](DESIGN.md)

## Data and execution

DSH settings owns saved rules. A rule stores a stable ID, enabled state, editable rule title and description, event, input source, optional fixed input, question source, question title or script, probability threshold, and 2–16 options with stable IDs, labels, and actions. Existing `phase/question/context/threshold` rules migrate when settings are read. Legacy `beforeEnabled/afterEnabled` fields remain readable; enabled rules control runtime.

The `before` event reads the latest user text or text visible at `agent/pre-step` and appends the selected option's context before the main model request. The `after` event reads host tool-result IDs, failure status, and text at `llm/stream`; it buffers the original stream and appends the selected reminder before `finish`. It cannot retract content already displayed. Fixed custom input is used verbatim when its event occurs.

A before-event option may request a named Skill. Jev loads model-invocable Skills in the current Agent scope and working directory, then triggers `skill-injection` rules before writing the body into the session. Rules select the input source: Skill summary plus latest user message, full body, latest user message, current-step text, or fixed text. Questions, options, and thresholds remain configurable. Option actions continue, skip this candidate, or append context to its body. If configured Skill-event rules cannot be judged, that injection is omitted. A full body already visible in the session is not written again. The host owns user-explicit Skill invocation, which this event does not change.

The `skill-catalog` event is rule-configured. The supplied “Skill trimming” rule reads current visible conversation text, creates candidate options from the host catalog, asks the configured question, and scores each candidate independently from 0 to 1. Its option action count keeps the top 10 by default, updating both the model text and durable source entries. The question, minimum score, count, and enabled state can be edited. On ranking failure, the host catalog is preserved with a warning. Catalogs already recorded in older sessions are not retroactively deleted.

A question script is trusted JavaScript saved in settings. It runs in a separate Node worker with a five-second timeout and 64 MiB old-generation limit. It can read files through Node APIs. It receives event, input, and option IDs/default labels and may return only a title and labels for those same IDs. The policy interpreter reads actions exclusively from saved rules, never from model or script output.

An ordinary model returns JSON probabilities for every option of every active rule. IDs, ranges, and sums are validated. Only the highest-probability option above threshold acts, in rule order and within the context budget. Failures preserve the original decision or stream. Native Jev models are identified by model ID and reject the ordinary JSON path until a provider adapter exists.

## UI and testing

Rule settings contain one master switch, a judge-model picker, and compact four-stage rule editing. The collapsed card shows the separately saved rule title and description, falling back to the rule number for older titles. One rule opens at a time, detailed help and option action text expand on demand, and save controls remain above the list. Dynamic sources describe the exact runtime content; script mode states that the title and labels are generated at runtime. Actions and parameters belong to options. A separate test view within the settings section runs a disposable Choice request without changing a session. Ordinary models show option probabilities and distribution concentration, not calibrated confidence.

## Acceptance

Check legacy migration, browser schema serialization, input sources, script file access and output restrictions, option actions, probability validation, context budget, build, pinned installation, installed artifacts, restarted DSH process, and real browser interaction.
