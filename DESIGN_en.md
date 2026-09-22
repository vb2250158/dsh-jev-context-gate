# Jev Context Gate Design

English | [简体中文](DESIGN.md)

Status: work in progress; not installed or end-to-end verified.

## Ownership

An independent DSH plugin, with no RabiRoute, Manager, persona or plan runtime dependency. Source belongs to its own Git repository. DSH settings owns user configuration. Installation uses a published fixed Git commit. The official checkout is inspected for contracts only.

## Data-driven rules

Each rule contains a stable id, enabled flag, before/after phase, complete classification question, match-probability threshold and predefined context. Array order determines evaluation order. A total context budget includes wrappers; individual instructions are never truncated. Model output selects rules, not executable scripts, additional privileges or arbitrary replacement prompts. Runtime and test UI share the interpreter.

## Before

After user submission and before the first main-model request, determine whether investigation and tool/skill guidance are required. Inject only matching rules. Guidance cannot authorize or install tools. Dynamic tool composition remains subject to the verified public DSH contract.

## After

Compare the actual user request, candidate answer and host-recorded tool results. Detect unsupported causal claims and hedged guesses used instead of available investigation. Self-reported work is not evidence; reading a file does not establish a claim.

Check event timing against streaming visibility. A stop hook after displayed text is corrective continuation, not pre-publication interception. Never rewrite history. Bound corrections and respect cancellation, denied permissions and real blockers.

## Models

Use exact DSH provider/model routes without changing the main conversation model. Native Jev requires its documented structured protocol, not chat JSON mislabeled as native Jev. Generic-model self-reported probabilities are not calibrated confidence. Invalid responses, timeouts and configuration changes are explicit; no silent model fallback.

## Settings and testing

Add a Jev settings entry with master switch, model picker, phase switches, editable rules, budgets and correction limits. Reuse the supported model catalog and picker extension; do not import private components.

The Jev Test action accepts text, phase, optional candidate answer and synthetic evidence. Show raw output, normalized probabilities, matching rules, exact injection preview, latency and errors. Preview never injects into a real session or executes tools. Test text is not automatically included in source or shared settings.

## Acceptance

Structured-judge and rule tests, lifecycle cancellation/reentry, real composition loading, save conflicts, independent model selection, live model testing, light/dark/custom themes, disposal, publication screening and fixed-commit installation. Ten unit tests currently pass (six interpreter and four structured-judge); host composition, live model panel, post-answer evidence gate and installation acceptance remain incomplete.
