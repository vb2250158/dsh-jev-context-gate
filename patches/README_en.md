# Complete request context patch

`2026-10-10-request-context-policy.patch` targets DSH `0.2.1-alpha.1`, upstream commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`. Application was verified on that commit with the managed environment's existing `2026-10-09-consolidated-on-5badb15.patch`. This plugin does not redistribute that existing patch. Preserve local changes, check the baseline, and resolve a failed `git apply --check` before applying.

Run the commands in [the Chinese instructions](README.md) from the DSH checkout; `<plugin>` is this plugin's absolute checkout path. Build the affected Host packages, regenerate API documentation and translation records, install through the managed manifest, restart the host, and recover original sessions.

Automatic compaction now runs after complete input and bound route capacity are logged, through `agent/request-context`, before request freezing. Extensions relying on pre-step compaction order must migrate; ordinary input rewriting still uses `agent/pre-step`. `compaction/pressure-policy` resolves the trigger, target and retained-tail budgets. It does not change the model's actual output limit.

Replacements use existing durable event types; no session format changes or historical overwrites are introduced. Unloading disposes tools and listeners; already logged replacements remain effective and original content remains recorded. Disable `contextPolicy.enabled` before reverting host code and restore from the installation snapshot. Recheck the patch after upstream updates; do not apply it twice.

Run `npm run check` in this plugin, then set `DSH_SOURCE_ROOT` to the patched host checkout and run `node tests/host-smoke.mjs`. The keyless test uses the real Loader and production AgentLoop for 31 requests, verifies one latest snapshot, stable unchanged input, retained authorization, and readable complete originals, and compares a committed model-input snapshot.
