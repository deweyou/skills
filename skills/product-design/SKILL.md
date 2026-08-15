---
name: product-design
description: >
  Product design workflow for personal products. Use when the user asks whether
  to build an idea or feature, how to shape the next version, how similar
  products solve a problem, or how to turn product thinking into a buildable
  decision without enterprise process theater.
---

# Product Design

Use this skill as a product design partner for personal products. The
goal is not to produce enterprise PRDs or roadmap theater by default. The goal
is to help the user see the product problem clearly, inspect relevant existing
products when needed, and choose the right next move.

Depth should match the decision. A small feature tradeoff may need a concise
answer. A product direction, positioning question, or ambiguous market pattern
may need deeper research and a fuller product design proposal.

## When To Use

Use this skill when the user asks product-design or iteration questions such as:

- whether a product idea or feature is worth doing
- how to scope, sequence, or shape the next version
- how similar products solve a product problem
- how to land an idea as a buildable product direction
- whether to research existing products before recommending
- Chinese phrases such as "这个功能要不要做", "下一版怎么迭代",
  "帮我看看类似产品", "不要凭空想", "先调研一下", "别人怎么做",
  or "这个想法怎么落地"
- English phrases such as "product design", "research similar products",
  "next version", or "is this feature worth building"

Use research when external examples could change the answer. Stay focused on
what the user can build, test, decide, or deliberately postpone.

## When Not To Use

- Do not use this skill for coding/debugging tasks with no product decision.
- Use `ui-design` when the core question is interface flow, visual design, or UI
  implementation rather than product scope or market pattern.
- Use `product-notes` when the user wants to write durable product notes rather
  than decide what to build next.

## Core Principles

- Prefer testable product moves over broad plans unless the user is explicitly
  asking for a broader product direction.
- Separate observation, judgment, assumption, and recommendation.
- Research before recommending when external examples can change the answer.
- Avoid copying enterprise SaaS complexity into a personal product.
- Preserve product taste and maker momentum while making tradeoffs explicit.
- Give advice that can become the next implementation, experiment, or note.

## Mode Selection

Choose the depth that answers the user. Do not stay shallow when the decision
requires research, synthesis, or a fuller product design proposal.

### Exploration Mode

Use this mode when the user asks to inspect similar products, competitor
patterns, market examples, pricing, onboarding, positioning, or "how others do
it." Also use it when the user's iteration question depends on current product
behavior outside the active product.

Do not invent advice from general intuition when the answer depends on external
examples. Gather references first.

### Iteration Mode

Use this mode when the user asks whether to build a feature, how to scope the
next version, how to land an idea, how to decide what not to do, or how to turn
research into a product direction.

If the iteration decision depends on external product examples, run Exploration
Mode first, then make the iteration recommendation.

## Research Playbook

When research is needed, read `references/product-research-playbook.md` and use
only the parts relevant to the question. Keep the research scope proportional to
the decision.

Good sources include official product pages, docs, public demos, app store
listings, changelogs, pricing pages, screenshots, onboarding flows, help docs,
and credible reviews. Prefer direct product evidence over generic articles.

If browsing or product access is unavailable, say what could not be inspected
and mark the recommendation as lower confidence instead of pretending.

## Workflow

1. Restate the product question in one sentence.
2. Decide whether external references are needed.
3. If needed, inspect 3-6 relevant products or examples.
4. Extract patterns, not a long catalog.
5. Evaluate fit for the personal product: audience, scope, complexity,
   product taste, implementation cost, and validation value.
6. Recommend the next product direction, version shape, or decision, plus what
   to avoid for now.
7. Capture open questions only when they affect the next decision.

Even for concise routing or planning output, explicitly separate current
judgment, assumptions, validation needs, and next action when the user asks
whether a feature or product move is worth doing.

Routing or planning output must still be concrete enough to grade. Do not only
say "identify validation points" or "synthesize a recommendation later." When
the user states a narrow scope, name what that small version validates. For
example, a local-session-only version validates whether users return to saved
work and tolerate local-only limits before accounts or cloud sync exist. When a
research request asks for a next version after inspecting products, promise a
right-sized next-version recommendation and describe its likely shape, such as a
smaller onboarding flow, one default path, or one experiment instead of a broad
roadmap.

## Output Patterns

For exploration-heavy answers:

```text
Question
References inspected
Observed patterns
What fits your product
What not to copy
Recommended direction
Open questions
```

For direct iteration answers:

```text
Current judgment
Next version
Not now
Why this scope
What to validate
Next action
```

When recommending a deliberately small version, make the validation value
concrete: name what the smaller scope will prove or disprove, such as demand for
the workflow, frequency of use, retention, willingness to tolerate local-only
limits, or whether excluded complexity is actually needed.

Keep outputs concise for simple decisions. For deeper research requests, provide
enough evidence and synthesis for the user to judge the recommendation.

## Anti-Patterns

- Do not write a full PRD unless the user asks for one or the handoff clearly
  needs a fuller product specification.
- Do not recommend a heavy roadmap framework by default.
- Do not pad the answer with generic market categories.
- Do not imply a hypothesis is validated just because other products do it.
- Do not copy a competitor pattern without checking whether it fits the user's
  product size, taste, and constraints.

## Hand-Offs

- If the user asks to preserve the conclusion as product memory, use
  `product-notes` after this skill.
- If the next step becomes implementation, use the repository's normal coding
  workflow.
