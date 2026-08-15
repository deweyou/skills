#!/usr/bin/env node

/**
 * skill-eval runner.
 *
 * Run a skill's evals.json. For each case, write a prompt, spawn the agent CLI,
 * collect the transcript, spawn the grader CLI, and write grading.json.
 *
 * Usage:
 *   node run.js --skill <name> --agent '<cmd>' [--grader '<cmd>'] [--case <id>]
 *               [--out <dir>] [--timeout <sec>] [--timeout-retry <sec>]
 *   node run.js --evals <path> --agent '<cmd>'   # Use an explicit evals.json
 *
 * Agent and grader command templates use {PROMPT_FILE} for the temporary prompt
 * file path, avoiding shell escaping problems.
 * Examples:
 *   --agent 'claude --print "$(cat {PROMPT_FILE})"'
 *   --agent 'codex exec "$(cat {PROMPT_FILE})"'
 *
 * Exit code:
 *   0  All expectations passed
 *   1  At least one expectation failed
 *   2  Script, agent, or grader infrastructure failed
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SELF_ROOT = path.resolve(__dirname, '..');
const SKILLS_ROOT = path.resolve(SELF_ROOT, '..');
const GRADER_TEMPLATE_PATH = path.join(SELF_ROOT, 'references', 'grader-prompt.md');
const AGENT_REFERENCES = {
  claude: path.join(SELF_ROOT, 'references', 'claude-code-agent.md'),
  codex: path.join(SELF_ROOT, 'references', 'codex-agent.md'),
};

function die(msg, code = 2) {
  console.error(`[skill-eval] error: ${msg}`);
  process.exit(code);
}

function log(msg) {
  console.error(`[skill-eval] ${msg}`);
}

function parseArgs(argv) {
  const args = {
    skill: null,
    evals: null,
    agent: 'auto',
    grader: null,
    case: null,
    out: null,
    mode: 'execute',
    keepRuns: false,
    timeoutSec: 300,
    timeoutRetrySec: null,
    timeoutRetryEnabled: true,
    concurrency: 3,
    retryInfraFail: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--skill': args.skill = argv[++i]; break;
      case '--evals': args.evals = argv[++i]; break;
      case '--agent': args.agent = argv[++i]; break;
      case '--grader': args.grader = argv[++i]; break;
      case '--case': args.case = parseInt(argv[++i], 10); break;
      case '--out': args.out = argv[++i]; break;
      case '--mode': args.mode = argv[++i]; break;
      case '--keep-runs': args.keepRuns = true; break;
      case '--timeout': args.timeoutSec = parseInt(argv[++i], 10); break;
      case '--timeout-retry': args.timeoutRetrySec = parseInt(argv[++i], 10); break;
      case '--no-timeout-retry': args.timeoutRetryEnabled = false; break;
      case '--concurrency': args.concurrency = parseInt(argv[++i], 10); break;
      case '--no-retry-infra-fail': args.retryInfraFail = false; break;
      case '-h':
      case '--help': args.help = true; break;
      default: die(`unknown arg: ${a}`);
    }
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    die(`--concurrency must be a positive integer (got ${args.concurrency})`);
  }
  return args;
}

function printHelp() {
  console.log(`skill-eval runner

Usage:
  node run.js --skill <name> [--agent auto|codex|claude|'<cmd>'] [--grader '<cmd>'] [--case <id>]
              [--out <dir>] [--timeout <sec>] [--timeout-retry <sec>]
              [--mode execute|routing] [--keep-runs]

Required:
  --skill <name>     Skill name. Resolves skills/<name>/evals/evals.json
  OR
  --evals <path>     Use an explicit evals.json path

Optional:
  --agent '<cmd>'    Agent CLI command template using {PROMPT_FILE}; also supports auto|codex|claude
  --grader '<cmd>'   Grader CLI command template. Defaults to --agent
  --case <id>        Run one case
  --out <dir>        Output directory. Defaults to a temporary directory deleted after summary
  --mode <mode>      execute=run the prompt as a real task; routing=judge skill routing only
  --keep-runs        Retain the run dir; never retains artifacts inside <skill>/evals/runs/
  --timeout <sec>    Per agent/grader call timeout. Default: 300
  --timeout-retry    Timeout used for one retry after timeout. Default: 2x --timeout
  --no-timeout-retry Disable automatic timeout retry
  --concurrency <n>  Case concurrency. Default: 3. Each case still runs agent → grader sequentially
  --no-retry-infra-fail
                     Disable the post-batch serial retry for cases where the agent or grader
                     process exits abnormally. Real expectation failures and unparseable
                     grader output are not retried.

Agent presets:
  --agent auto       Choose codex or claude from the current harness environment
  --agent codex      Read references/codex-agent.md
  --agent claude     Read references/claude-code-agent.md

Custom template examples:
  --agent 'claude --print "$(cat {PROMPT_FILE})"'
  --agent 'codex exec --ephemeral --sandbox read-only "$(cat {PROMPT_FILE})"'
`);
}

function loadEvals(evalsPath) {
  if (!fs.existsSync(evalsPath)) die(`evals.json not found: ${evalsPath}`);
  const raw = fs.readFileSync(evalsPath, 'utf8');
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { die(`invalid JSON in ${evalsPath}: ${e.message}`); }
  if (!data.skill_name || !Array.isArray(data.evals)) {
    die(`evals.json missing required fields (skill_name, evals[]): ${evalsPath}`);
  }
  for (const e of data.evals) {
    if (e.id == null || !e.prompt || !Array.isArray(e.expectations)) {
      die(`eval case malformed (need id, prompt, expectations[]): ${JSON.stringify(e)}`);
    }
  }
  return data;
}

function timestamp() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${d.toISOString().replace(/[:.]/g, '-').slice(0, 23)}-${rand}`;
}

function renderTemplate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function extractFence(text, name, refPath) {
  const pattern = new RegExp('```' + name + '\\n([\\s\\S]*?)\\n```');
  const match = text.match(pattern);
  if (!match) die(`missing \`\`\`${name} fence in ${refPath}`);
  return match[1].trim();
}

function detectAgentPreset() {
  if (process.env.CODEX_SHELL || process.env.CODEX_CI || process.env.CODEX_THREAD_ID) return 'codex';
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE || process.env.CLAUDECODE_CLI) return 'claude';
  return 'claude';
}

function resolveAgentSpec(spec, mode, role) {
  if (!spec || spec === 'auto') {
    return resolveAgentSpec(detectAgentPreset(), mode, role);
  }
  if (!Object.prototype.hasOwnProperty.call(AGENT_REFERENCES, spec)) {
    return { preset: 'custom', command: spec };
  }

  const refPath = AGENT_REFERENCES[spec];
  const text = fs.readFileSync(refPath, 'utf8');
  const fenceName = role === 'grader' ? 'grader' : `agent-${mode}`;
  return {
    preset: spec,
    command: extractFence(text, fenceName, refPath),
  };
}

function loadSkillMarkdown(skillName) {
  const skillPath = path.join(SKILLS_ROOT, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return `SKILL.md not found: ${skillPath}`;
  return fs.readFileSync(skillPath, 'utf8');
}

function buildPrompt(evalCase, evals, mode) {
  if (mode === 'execute') return evalCase.prompt;
  if (mode !== 'routing') die(`unsupported --mode: ${mode} (expected execute or routing)`);

  return [
    'You are running a skill routing eval. Judge routing only; do not execute the user task.',
    '',
    'Hard rules:',
    '- Do not run shell commands, Bash, file writes, network requests, downloads, app launches, or real business scripts.',
    '- Do not continue the user task itself. Only decide which skills this user input should trigger.',
    '- If clarification is needed, state what should be asked, but do not enter the downstream workflow.',
    '- Keep the output concise. Prefer JSON. Do not wrap the response in Markdown code fences.',
    '',
    'Using the available repository skills and their description / SKILL.md content, decide:',
    `- target_skill: ${evals.skill_name}`,
    '- triggered_skills: array of skill names that should trigger',
    '- rejected_skills: array of nearby or confusable skill names that should explicitly not trigger',
    '- should_ask_clarification: whether clarification should be asked first',
    '- next_action_summary: what the next step would be if this were executed, described only',
    '- evidence: brief reason for the decision',
    '',
    'Output JSON fields:',
    '- target_skill',
    '- triggered_skills',
    '- rejected_skills',
    '- should_ask_clarification',
    '- planned_actions: array; each item describes the skill / script / args that would be used and whether the user must be asked first',
    '- next_action_summary',
    '- evidence',
    '',
    `Target skill SKILL.md content:\n\n${loadSkillMarkdown(evals.skill_name)}`,
    '',
    'User input:',
    evalCase.prompt,
  ].join('\n');
}

function spawnCli(cmdTemplate, promptFile, timeoutMs) {
  // Replace {PROMPT_FILE} with the temporary prompt file path.
  const cmd = cmdTemplate.split('{PROMPT_FILE}').join(promptFile);
  return new Promise(resolve => {
    // Close stdin so CLIs like `codex exec` do not wait for extra input after
    // receiving the prompt argument.
    const child = spawn('bash', ['-c', cmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => stdoutChunks.push(d));
    child.stderr.on('data', d => stderrChunks.push(d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const settle = (status, signal, errorMsg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        status,
        signal,
        error: errorMsg,
      });
    };
    child.on('error', err => settle(null, null, String(err.message || err)));
    child.on('close', (code, signal) => {
      settle(code, signal, timedOut ? 'ETIMEDOUT: command timed out' : null);
    });
  });
}

function isTimeoutResult(result) {
  return result.error && result.error.includes('ETIMEDOUT');
}

async function spawnCliWithTimeoutRetry(cmdTemplate, promptFile, timeoutMs, retryTimeoutMs, label, caseId) {
  const first = await spawnCli(cmdTemplate, promptFile, timeoutMs);
  const attempts = [{ ...first, timeoutMs }];
  if (isTimeoutResult(first) && retryTimeoutMs && retryTimeoutMs > timeoutMs) {
    log(`case ${caseId}: ${label} timed out after ${Math.round(timeoutMs / 1000)}s; retrying with ${Math.round(retryTimeoutMs / 1000)}s`);
    const second = await spawnCli(cmdTemplate, promptFile, retryTimeoutMs);
    attempts.push({ ...second, timeoutMs: retryTimeoutMs });
    return { ...second, attempts, retried_after_timeout: true };
  }
  return { ...first, attempts, retried_after_timeout: false };
}

function parseGraderJson(raw, caseId) {
  // The grader should output pure JSON. Strip likely fences or extra text.
  let text = raw.trim();
  // Strip ```json ... ``` fences.
  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/m;
  const m = text.match(fence);
  if (m) text = m[1].trim();
  // Try the substring from the first { through the last }.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  try { return JSON.parse(text); }
  catch (e) {
    log(`case ${caseId}: grader returned non-JSON, marking all expectations FAIL. raw=${raw.slice(0, 200)}...`);
    return null;
  }
}

function buildFailureGrading(expectations, reason) {
  const failed = expectations.map(text => ({
    text,
    passed: false,
    evidence: reason,
  }));
  return {
    expectations: failed,
    summary: {
      passed: 0,
      failed: failed.length,
      total: failed.length,
      pass_rate: 0,
    },
  };
}

function writeRunFile(runDir, filename, content) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, filename), content, 'utf8');
}

function oneLine(text, maxLen = 220) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 3)}...`;
}

function tableCell(text, maxLen = 220) {
  return oneLine(text, maxLen).replace(/\|/g, '\\|');
}

function printDetailedReport(summary) {
  console.log('');
  console.log('=== skill-eval detailed report ===');
  console.log('');
  console.log('| Case | Prompt | Result |');
  console.log('|---:|---|---:|');
  for (const c of summary.cases) {
    const s = c.grading.summary || {};
    console.log(`| ${c.id} | ${tableCell(c.prompt, 80)} | ${s.passed || 0}/${s.total || 0} |`);
  }

  console.log('');
  console.log('---');
  for (const c of summary.cases) {
    const s = c.grading.summary || {};
    console.log('');
    console.log(`Case ${c.id}: ${s.passed || 0}/${s.total || 0}`);
    console.log(`Prompt: ${oneLine(c.prompt, 160)}`);
    if (c.agent_failed) console.log('Status: agent failed');
    if (c.grader_failed) console.log('Status: grader failed');
    if (c.grader_unparseable) console.log('Status: grader output unparseable');
    if (c.agent_retried_after_timeout) console.log('Retry: agent timed out once and was retried with a longer timeout');
    if (c.grader_retried_after_timeout) console.log('Retry: grader timed out once and was retried with a longer timeout');
    if (c.infra_retry_attempts) {
      console.log(`Retry: infra-fail serial retry ×${c.infra_retry_attempts} (${c.infra_retry_recovered ? 'recovered' : 'still failed'})`);
    }

    const expectations = Array.isArray(c.grading.expectations) ? c.grading.expectations : [];
    for (const e of expectations) {
      console.log(`- ${e.passed ? 'PASS' : 'FAIL'} ${oneLine(e.text, 180)}`);
      console.log(`  evidence: ${oneLine(e.evidence, 240)}`);
    }
  }
}

function formatAttempts(attempts) {
  return attempts.map((attempt, index) => [
    `=== ATTEMPT ${index + 1} timeout=${Math.round(attempt.timeoutMs / 1000)}s ===`,
    `=== STDOUT ===`,
    attempt.stdout,
    `=== STDERR ===`,
    attempt.stderr,
    `=== META ===`,
    `status=${attempt.status}`,
    `signal=${attempt.signal}`,
    `error=${attempt.error}`,
  ].join('\n')).join('\n');
}

function defaultRunDir(skillName) {
  return path.join(os.tmpdir(), 'skill-eval-runs', skillName, timestamp());
}

function evalsRunsDir(evalsPath) {
  return path.join(path.dirname(evalsPath), 'runs');
}

function isInsideDir(target, parent) {
  const rel = path.relative(parent, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function cleanupRepoRunsDir(evalsPath) {
  fs.rmSync(evalsRunsDir(evalsPath), { recursive: true, force: true });
}

async function runOneCase(evalCase, agentCmd, graderCmd, runDir, timeoutMs, retryTimeoutMs) {
  const id = evalCase.id;
  log(`case ${id}: ${evalCase.prompt.slice(0, 60).replace(/\n/g, ' ')}${evalCase.prompt.length > 60 ? '...' : ''}`);

  // 1. Write prompt to file.
  const promptFile = path.join(runDir, `case-${id}.prompt`);
  writeRunFile(runDir, `case-${id}.prompt`, buildPrompt(evalCase, currentEvals, currentMode));

  // 2. spawn agent
  const agentResult = await spawnCliWithTimeoutRetry(agentCmd, promptFile, timeoutMs, retryTimeoutMs, 'agent', id);
  const transcript = formatAttempts(agentResult.attempts);
  writeRunFile(runDir, `case-${id}.transcript`, transcript);

  // Agent failure marks every expectation as FAIL.
  if (agentResult.error || (agentResult.status !== 0 && agentResult.status != null)) {
    const grading = buildFailureGrading(
      evalCase.expectations,
      `Agent CLI failed (status=${agentResult.status}, error=${agentResult.error || 'non-zero exit'})`,
    );
    writeRunFile(runDir, `case-${id}.grading.json`, JSON.stringify(grading, null, 2));
    return {
      id,
      prompt: evalCase.prompt,
      grading,
      agent_failed: true,
      agent_retried_after_timeout: agentResult.retried_after_timeout,
    };
  }

  // 3. Build grader prompt.
  const template = fs.readFileSync(GRADER_TEMPLATE_PATH, 'utf8');
  const graderPrompt = renderTemplate(template, {
    USER_PROMPT: evalCase.prompt,
    TRANSCRIPT: transcript,
    EXPECTATIONS_JSON: JSON.stringify(evalCase.expectations, null, 2),
  });
  const graderPromptFile = path.join(runDir, `case-${id}.grader-prompt`);
  writeRunFile(runDir, `case-${id}.grader-prompt`, graderPrompt);

  // 4. spawn grader
  const graderResult = await spawnCliWithTimeoutRetry(graderCmd, graderPromptFile, timeoutMs, retryTimeoutMs, 'grader', id);
  const graderRaw = formatAttempts(graderResult.attempts);
  writeRunFile(runDir, `case-${id}.grader-output.txt`, graderRaw);

  if (graderResult.error || (graderResult.status !== 0 && graderResult.status != null)) {
    const grading = buildFailureGrading(
      evalCase.expectations,
      `Grader CLI failed (status=${graderResult.status}, error=${graderResult.error || 'non-zero exit'})`,
    );
    writeRunFile(runDir, `case-${id}.grading.json`, JSON.stringify(grading, null, 2));
    return {
      id,
      prompt: evalCase.prompt,
      grading,
      grader_failed: true,
      grader_retried_after_timeout: graderResult.retried_after_timeout,
    };
  }

  // 5. parse grader JSON
  const grading = parseGraderJson(graderResult.stdout, id);
  if (!grading || !grading.summary) {
    const fallback = buildFailureGrading(evalCase.expectations, 'Grader output not parseable as expected JSON');
    writeRunFile(runDir, `case-${id}.grading.json`, JSON.stringify(fallback, null, 2));
    return {
      id,
      prompt: evalCase.prompt,
      grading: fallback,
      grader_unparseable: true,
      grader_retried_after_timeout: graderResult.retried_after_timeout,
    };
  }
  writeRunFile(runDir, `case-${id}.grading.json`, JSON.stringify(grading, null, 2));
  return {
    id,
    prompt: evalCase.prompt,
    grading,
    agent_retried_after_timeout: agentResult.retried_after_timeout,
    grader_retried_after_timeout: graderResult.retried_after_timeout,
  };
}

let currentEvals = null;
let currentMode = 'execute';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  if (!['execute', 'routing'].includes(args.mode)) {
    die(`unsupported --mode: ${args.mode} (expected execute or routing)`);
  }
  const agentSpec = resolveAgentSpec(args.agent, args.mode, 'agent');
  const graderSpec = args.grader
    ? resolveAgentSpec(args.grader, args.mode, 'grader')
    : (agentSpec.preset === 'custom'
      ? resolveAgentSpec(agentSpec.command, args.mode, 'grader')
      : resolveAgentSpec(agentSpec.preset, args.mode, 'grader'));

  // Resolve evals.json path.
  let evalsPath;
  if (args.evals) {
    evalsPath = path.resolve(args.evals);
  } else if (args.skill) {
    evalsPath = path.join(SKILLS_ROOT, args.skill, 'evals', 'evals.json');
  } else {
    die('one of --skill <name> or --evals <path> is required');
  }

  const evals = loadEvals(evalsPath);
  currentEvals = evals;
  currentMode = args.mode;
  log(`loaded ${evals.evals.length} case(s) for skill "${evals.skill_name}" from ${evalsPath}`);
  log(`mode: ${args.mode}`);
  log(`agent: ${agentSpec.preset}`);
  log(`grader: ${graderSpec.preset}`);

  // Choose run dir.
  const runDir = args.out
    ? path.resolve(args.out)
    : defaultRunDir(evals.skill_name);
  fs.mkdirSync(runDir, { recursive: true });
  const repoRunsDir = evalsRunsDir(evalsPath);
  const runDirInRepoRuns = isInsideDir(runDir, repoRunsDir);
  log(`run dir: ${runDir}${args.keepRuns && !runDirInRepoRuns ? '' : ' (will be deleted after summary; pass --keep-runs with a non-evals/runs --out to retain)'}`);

  // Filter cases.
  const cases = args.case != null
    ? evals.evals.filter(e => e.id === args.case)
    : evals.evals;
  if (cases.length === 0) die(`no case matched (--case=${args.case})`);

  // Run cases.
  const timeoutMs = args.timeoutSec * 1000;
  const timeoutRetrySec = args.timeoutRetryEnabled
    ? (args.timeoutRetrySec || args.timeoutSec * 2)
    : null;
  const retryTimeoutMs = timeoutRetrySec ? timeoutRetrySec * 1000 : null;
  const concurrency = Math.min(args.concurrency, cases.length);
  log(`concurrency: ${concurrency}`);

  const results = [];
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const myIdx = nextIdx++;
      if (myIdx >= cases.length) return;
      const evalCase = cases[myIdx];
      const r = await runOneCase(evalCase, agentSpec.command, graderSpec.command, runDir, timeoutMs, retryTimeoutMs);
      results.push(r);
      const s = r.grading.summary;
      const passed = s ? s.passed : 0;
      const total = s ? s.total : evalCase.expectations.length;
      const flag = passed === total ? '✓' : '✗';
      log(`case ${r.id}: ${flag} ${passed}/${total} passed${r.agent_failed ? ' (agent failed)' : ''}${r.grader_failed ? ' (grader failed)' : ''}${r.grader_unparseable ? ' (grader output unparseable)' : ''}${r.agent_retried_after_timeout ? ' (agent retried)' : ''}${r.grader_retried_after_timeout ? ' (grader retried)' : ''}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  // Concurrent runs finish out of order; sort by id for readability.
  results.sort((a, b) => a.id - b.id);

  // After the batch, retry infra failures serially once. Concurrent claude/codex
  // CLI runs can occasionally return status=1; a serial retry often recovers.
  // Do not retry real expectation failures or grader_unparseable cases.
  if (args.retryInfraFail) {
    const infraFailIds = results
      .filter(r => r.agent_failed || r.grader_failed)
      .map(r => r.id);
    if (infraFailIds.length > 0) {
      log(`infra-fail detected on ${infraFailIds.length} case(s): [${infraFailIds.join(', ')}]; retrying serially`);
      for (const id of infraFailIds) {
        const evalCase = cases.find(c => c.id === id);
        if (!evalCase) continue;
        log(`case ${id}: serial infra retry`);
        const retry = await runOneCase(evalCase, agentSpec.command, graderSpec.command, runDir, timeoutMs, retryTimeoutMs);
        retry.infra_retry_attempts = 1;
        retry.infra_retry_recovered = !retry.agent_failed && !retry.grader_failed;
        const idx = results.findIndex(r => r.id === id);
        if (idx >= 0) results[idx] = retry;
        const s = retry.grading.summary;
        const passed = s ? s.passed : 0;
        const total = s ? s.total : evalCase.expectations.length;
        const flag = passed === total ? '✓' : '✗';
        const tag = retry.infra_retry_recovered ? 'recovered' : 'still failed';
        log(`case ${id}: infra retry ${flag} ${passed}/${total} (${tag})`);
      }
    }
  }

  // Summarize.
  let totalPassed = 0, totalFailed = 0;
  for (const r of results) {
    totalPassed += (r.grading.summary && r.grading.summary.passed) || 0;
    totalFailed += (r.grading.summary && r.grading.summary.failed) || 0;
  }
  const total = totalPassed + totalFailed;
  const passRate = total > 0 ? totalPassed / total : 0;
  const summary = {
    skill_name: evals.skill_name,
    evals_path: evalsPath,
    run_dir: runDir,
    case_count: cases.length,
    cases: results,
    overall: {
      passed: totalPassed,
      failed: totalFailed,
      total,
      pass_rate: passRate,
    },
  };
  writeRunFile(runDir, 'grading.json', JSON.stringify(summary, null, 2));

  console.log('');
  console.log(`=== skill-eval summary: ${evals.skill_name} ===`);
  console.log(`cases:      ${cases.length}`);
  console.log(`passed:     ${totalPassed} / ${total}`);
  console.log(`pass rate:  ${(passRate * 100).toFixed(1)}%`);
  printDetailedReport(summary);
  if (args.keepRuns) {
    if (runDirInRepoRuns) {
      fs.rmSync(runDir, { recursive: true, force: true });
      cleanupRepoRunsDir(evalsPath);
      console.log('run dir:    deleted (evals/runs artifacts are never retained)');
    } else {
      cleanupRepoRunsDir(evalsPath);
      console.log(`run dir:    ${runDir}`);
      console.log(`summary:    ${path.join(runDir, 'grading.json')}`);
    }
  } else {
    fs.rmSync(runDir, { recursive: true, force: true });
    cleanupRepoRunsDir(evalsPath);
    console.log('run dir:    deleted (pass --keep-runs to retain artifacts)');
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`[skill-eval] uncaught error: ${err && err.stack || err}`);
  process.exit(2);
});
