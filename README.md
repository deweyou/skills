# Deweyou Agent Assets

一组可独立使用、组合使用的 Agent assets，包括主动工作流 skills、被动工程 rules 和设计契约。这个仓库只维护可复用资产，不包含 runtime、CLI 或其他 Agent 基础设施。

## Skills

| Skill | 用途 |
| --- | --- |
| [`problem-framing`](skills/problem-framing/README_ZH.md) | 在实现前澄清问题、发散方案、批判取舍并收敛建议 |
| [`product-design`](skills/product-design/README_ZH.md) | 为个人产品做调研、范围判断和版本决策 |
| [`ui-design`](skills/ui-design/README_ZH.md) | UX/UI 调研、流程、视觉、原型、实现与评审 |
| [`spec-driven-coding`](skills/spec-driven-coding/README_ZH.md) | 需求对齐、调试、TDD、实现和验证 |
| [`repo-memory`](skills/repo-memory/README_ZH.md) | 维护 `AGENTS.md`、项目文档和长期仓库知识 |
| [`git-delivery`](skills/git-delivery/README_ZH.md) | 安全处理分支、提交、推送、PR 与 CI 跟进 |
| [`skill-eval`](skills/skill-eval/README_ZH.md) | 生成和运行 skill 路由及工作流评测 |

每个目录以 `SKILL.md` 为 Agent 的执行入口，`README.md` 与 `README_ZH.md` 用于人类阅读；部分 skill 还包含 `references/`、`scripts/` 或 `evals/`。

## Rules

| Rule | 用途 |
| --- | --- |
| [`code-style`](rules/code-style.md) | 命名、函数、注释、错误处理和测试风格 |
| [`engineering-principles`](rules/engineering-principles.md) | 模块边界、抽象、依赖、状态与可删除性 |

Rules 是按场景加载的被动约束，不通过 Skills CLI 安装。使用方应在自己的 Agent 配置中明确引用需要的 rule 文件。

## Design

| Contract | 用途 |
| --- | --- |
| [`dewey-interface`](design/dewey-interface.md) | Dewey 个人产品的克制、排版驱动、组件化界面风格 |

Design contract 定义界面应该呈现的风格和约束；UI skill 仍负责决定具体工作流。

## 安装 Skills

安装单个 skill：

```bash
npx skills add deweyou/skills --skill <skill-name>
```

例如：

```bash
npx skills add deweyou/skills --skill repo-memory
```

查看安装器支持的选项，或选择多个 skill：

```bash
npx skills add deweyou/skills
```

## 维护

- 修改 skill 工作流时，以对应的 `SKILL.md` 为源，并同步英文、中文 README 与 `evals/evals.json`。
- 修改 rule 或 design contract 时，保持 frontmatter `name` 与文件名一致，并同步更新本页目录。
- `README_ZH.md` 顶部的 `source-digest` 必须等于对应 `SKILL.md` 的 SHA-256。
- 新增 skill 时保持目录名、frontmatter `name`、安装示例和 eval 的 `skill_name` 一致。
- eval runner 会调用外部 Agent 和 LLM；除非明确需要执行评测，否则只校验静态资产。

静态校验不需要安装依赖：

```bash
npm run validate
```

首次 clone 后启用仓库自带的 pre-commit hook：

```bash
npm run prepare
```

之后每次提交前都会自动运行 `npm run validate`。

详细维护约定见 [`AGENTS.md`](AGENTS.md)。

## License

[MIT](LICENSE)
