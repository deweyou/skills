# Repository Guide

This repository publishes standalone Agent assets: active skills, passive rules, and design contracts. Keep changes scoped to these assets and their documentation; runtime, CLI, and unrelated Agent infrastructure belong in their own repositories.

## Repository layout

- `skills/<name>/SKILL.md` is the executable source of truth for a skill.
- `skills/<name>/README.md` and `README_ZH.md` are human-facing companions.
- `skills/<name>/evals/evals.json` contains routing and workflow regression cases.
- `references/` contains material loaded only when the skill routes to it.
- `scripts/` contains skill-owned executable helpers.
- `rules/<name>.md` contains passive engineering guidance loaded for matching work.
- `design/<name>.md` contains reusable design contracts applied alongside UI skills.

## Rules and design contracts

- Read `rules/code-style.md` when writing, editing, or reviewing code.
- Read `rules/engineering-principles.md` for architecture, module boundaries, dependencies, state, or refactoring decisions.
- Read `design/dewey-interface.md` only when the user or host project asks for Dewey's interface style; host-project design rules take precedence.
- Keep rule and design filenames in kebab-case, with frontmatter `name` matching the filename.
- Rules and design contracts are passive assets. Do not present them as installable skills or add them to the Skills CLI catalog.

## Editing a skill

Follow this authoring loop for new skills and meaningful behavior changes:

1. Start from concrete positive, negative, and ambiguous user prompts. Define the capability, trigger boundary, non-goals, and expected output before writing instructions.
2. Identify reusable contents. Put the core workflow and resource-routing decisions in `SKILL.md`; put detailed knowledge in `references/`, deterministic repeated operations in `scripts/`, and output materials in `assets/`.
3. Keep progressive disclosure shallow. Reference support files directly from `SKILL.md`, explain exactly when to read or run them, avoid duplicated guidance, and keep `SKILL.md` below 500 lines.
4. Match instruction freedom to task risk: principles for judgment-heavy work, parameterized procedures for repeatable work, and exact scripts or steps for fragile operations.
5. Preserve the boundary between neighboring skills and update cross-skill handoffs when that boundary changes.
6. Synchronize behavior changes into both README companions and the relevant eval cases.
7. Run static validation, then iterate from realistic usage. Forward-test complex skills only when useful and authorized; do not expose the expected answer to the evaluating agent.

### Frontmatter and description

- The skill directory and frontmatter `name` must match, use kebab-case, and stay below 64 characters.
- `name` and `description` are required. Add other frontmatter fields only when the target platform supports them and the skill needs them.
- `description` is discovery metadata. It must state both what the skill does and the concrete contexts in which it should trigger.
- Keep `description` at or below 900 UTF-8 bytes. Do not stuff individual eval phrases into it; detailed trigger, non-trigger, workflow, and boundary guidance belongs in the body.

### Eval contract

- Every new skill needs `evals/evals.json`. Update it whenever trigger behavior, workflow requirements, side-effect boundaries, or output expectations change.
- Include realistic positive, negative, and ambiguous prompts. Cover nearby skills and important non-trigger cases, not only happy paths.
- Each eval needs a unique integer `id`, non-empty `prompt`, non-empty `expected_output`, and a non-empty string array of `expectations`.
- Generating or updating eval cases is normal maintenance. Do not run the LLM-backed eval runner unless the user explicitly requests eval execution.

### Human-facing README companions

This repository intentionally keeps human-facing documentation in addition to the executable skill package:

- `README.md` is the English companion and `README_ZH.md` is the Simplified Chinese companion.
- Both companions must describe the same current capability, triggers, features, installation command, and concise SOP. Add a Mermaid diagram when it materially clarifies the workflow.
- Keep every install example and source footer pointed at `deweyou/skills`.
- Update both companions whenever skill behavior changes; do not let either become an independent behavior source.

For `README_ZH.md`, keep the metadata comment at the top. Its `source` must point to the corresponding `SKILL.md`, and `source-digest` must be the lowercase SHA-256 of that file.

## Adding a skill

A new `skills/<name>/` directory should include:

- `SKILL.md` with valid YAML frontmatter and a `name` matching the directory.
- `README.md` and `README_ZH.md` with installation using `npx skills add deweyou/skills --skill <name>`.
- `evals/evals.json` with matching `skill_name` and realistic positive, negative, and ambiguous prompts.
- Only the references, scripts, templates, or assets required by the workflow.

Add the skill to the root README catalog. Avoid copying runtime code or private/project-specific state into this repository.

When adding a rule or design contract, add the Markdown asset to the matching directory and update the corresponding root README catalog. Do not add a `SKILL.md` or eval suite unless the asset is an actual invocable workflow.

## Validation

Before handing off a change, run:

```bash
npm run validate
git diff --check
```

The tracked `.githooks/pre-commit` runs `npm run validate`. Run `npm run prepare` once after cloning to configure the local checkout's `core.hooksPath`; do not bypass the hook unless the user explicitly requests it and the skipped validation is reported.

Also verify:

- directory name, frontmatter `name`, eval `skill_name`, and install examples agree;
- skill names stay below 64 characters and descriptions stay at or below 900 UTF-8 bytes;
- eval cases have unique integer IDs and complete prompt, expected-output, and expectation fields;
- rule and design filenames match their frontmatter `name`;
- local Markdown links resolve;
- each Chinese README digest matches its `SKILL.md`;
- no stale reference to the former combined repository remains in published skill documentation.

Treat generated eval transcripts and temporary run artifacts as disposable; do not commit them.
