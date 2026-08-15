# Codex Agent Preset

Used by `scripts/run.js` when `--agent codex` or auto-detection selects Codex.

Notes:
- `codex exec --ephemeral` does not persist a normal session, but it still uses
  `CODEX_HOME` for auth/runtime state. Run the outer eval command in an
  environment that can read/write the configured Codex home.
- The runner closes child stdin (`stdio: ['ignore', 'pipe', 'pipe']`) so
  `codex exec` receives EOF immediately instead of waiting for additional
  stdin after the prompt argument.
- Do not add `--dangerously-bypass-approvals-and-sandbox` for routing evals.
  It bypasses Codex approvals/sandboxing, not auth, and makes accidental
  execution riskier.

```agent-routing
codex exec --ephemeral --sandbox read-only "$(cat {PROMPT_FILE})"
```

```agent-execute
codex exec "$(cat {PROMPT_FILE})"
```

```grader
codex exec --ephemeral --sandbox read-only "$(cat {PROMPT_FILE})"
```
