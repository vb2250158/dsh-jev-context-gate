# dsh-jev-context-gate

English | [简体中文](README.md)

Jev rules for DSH. A separate judge model reads selected event content, answers a Choice question, and activates the action owned by the selected option. Ordinary models use LLM JSON estimates. Model IDs starting with `jev-` are labeled native; structured native calls still require a provider adapter.

## 0.1.19

Tool-before and tool-after events can match an exact tool name, a prefix such as `rabiroute_*`, or all tools. A selected before action may deny dispatch. An after action may attach context or send a work-group progress update or question through Rabi.

Two disabled presets, “Work-group progress update” and “Ask work group and wait,” judge Rabi tool outcomes. Configure the exact Route ID, group ID, and role ID before enabling them. The selected action's editable instruction and event facts produce a short message; `rabiroute_agent_send` must confirm a sent channel receipt. The question rule queries new inbound group messages through `rabiroute_manager_api` every ten minutes by default. A quoted reply resumes the original session; an unquoted message is first judged for relevance. The interval and maximum polls are editable. Polling lives in the current DSH process and ends on restart.

## 0.1.17

Dynamic selection sends all candidates in one model request, requires a 0–1 score for each, then selects the top N, bottom N, scores above N%, or scores below N%. There is no fixed 100-item batch cap; the provider must still accommodate the full input and output. The legacy minimum relevance score remains editable under the additional minimum score control.

Option sources include manual configuration, splitting judgement input by newline, space, or a specified string, a fixed line-delimited list, and a trusted script. Dynamic actions may trim candidates or inject additional content. Trimming on the before event injects the selected subset while preserving the original user message. The Skill catalog event exposes its `skills` parameter as options; the UI displays “Current available Skills” while settings save the stable parameter `key`, separate from its localizable `display`. Catalog trimming returns selected entries to the event and replaces that catalog. The default Skill trimming rule keeps the top 10, and the count is editable.

## 0.1.16

The rule editor now exposes the top count directly. Change Skill trimming from 10 to 5 there. Candidate scoring uses one model request per batch of up to 100 items, with a finalist pass for larger sets; it does not send a separate request for each Skill. The relevance threshold applies even when the candidate count is below the top count.

For a custom list, add a rule for the user-message event, choose custom candidate filtering, enter one item per line, and configure the judgement input, question, threshold, and top count. Selected items enter the current conversation. A candidate script can instead return strings or `{ id, text }` entries and may read local files. Lists contain 2–500 items, at most 64000 characters in total; the top count is 1–50.

## 0.1.15

The rule list shows each configured title and description without generated rule numbers or extra summary tags. Edit opens a separate dialog for the event, input, question, and option actions. Save persists the changes; Cancel discards edits made in that dialog. If an older rule has no title, its description names the list item; if both are empty, it appears as an unnamed rule.

## 0.1.14

The configured “Skill trimming” rule handles the host Skill catalog before injection. It reads visible conversation context, asks “Which Skills are most relevant to the current context?”, derives candidate options from available Skill names and descriptions, and keeps the top 10 summaries. The title, question, input, threshold, count and enabled state are editable rule data. A before-event option can also name a Skill to load through the DSH Skill service. A separate “Skill body about to be injected” event judges each Jev-selected full body before insertion. User-explicit Skill invocation keeps the host behavior.

## 0.1.13

Rule title, rule description, and question title are saved separately. Collapsed cards show the rule title and description. Editing opens one rule at a time, option action text expands on demand, and save controls stay above the list. Existing rules without titles show their rule number until edited.

## 0.1.11

The browser migrates legacy rules before rendering the rule editor, avoiding a transient first-load crash.

## 0.1.10

- Each rule has a switch and an editable description shown in its collapsed summary. The compact editor has four parts: event, content to judge, question, and options with per-option actions; detailed help expands on demand.
- Events are user submission and tool-result return. Input can be the latest user text, text visible at the current step, actual tool results, or fixed custom text.
- A question can be configured directly or generated by trusted local JavaScript. The script may read files and return a title and option labels while stable option IDs retain their configured actions.
- Jev has one master switch. The test page is a separate view opened from rule settings; it neither executes rules nor modifies a session.
- Existing saved rules migrate to option actions on read. Legacy phase switches remain readable but no longer control runtime.

## Rule behavior

The user-message event runs at `agent/pre-step` and can append configured context or request a named Skill. The Skill-injection event runs before each Jev-selected Skill body enters the session; a selected skip action blocks that candidate. If enabled Skill-event rules cannot be judged, that injection is omitted. The tool-result event runs when `llm/stream` sees tool results and can append a reminder before the final finish chunk. The judge receives the title and all 2–16 option labels. Only the highest-probability option can act, and only above the configured threshold. Invalid results, missing input, script failure, or a context-budget overrun execute no action. Generic-model probabilities are estimates, not calibrated confidence.

Skill trimming filters summary catalog entries, not full Skill bodies. If ranking fails, the host catalog remains and a warning is logged. A full catalog already recorded in an older session remains in that history; a new session is filtered on its first injection.

## Question script

The script body receives `event` (`before`, `skill-catalog`, `skill-injection`, `after`, `tool-before`, or `tool-after`), `input`, and `options` (`[{ id, label }]`). It can use `await import(...)` and local Node APIs. Within five seconds it must return:

```js
const fs = await import('node:fs/promises')
const extra = await fs.readFile('C:/rules/question.txt', 'utf8')
return {
  title: extra.trim() + ': Does this request need investigation?',
  options: options.map(option => ({ id: option.id, label: option.label })),
}
```

The worker thread has local Node permissions, so configure only trusted code. Script output can change the title and labels, never option actions.

## Development and release

```powershell
npm run check
npm pack --dry-run
```

Publish source and tag, verify the remote SHA, update the pinned SHA and version in private `plugins.json`, Import, restart DSH, and verify the installed package and browser interactions. Do not install via `link:`, `file:`, or `workspace:`.

## Limitations

Native Jev structured calls still need a provider adapter. Generic probabilities are uncalibrated. A streamed reminder cannot retract text already displayed. The plugin does not verify factual claims.

MIT
