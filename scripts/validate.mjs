#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repositoryRoot = process.cwd()
const skillsRoot = join(repositoryRoot, 'skills')
const rulesRoot = join(repositoryRoot, 'rules')
const designRoot = join(repositoryRoot, 'design')
const errors = []
const formerCliName = ['deweyou', 'cli'].join('-')
const maxSkillNameCharacters = 64
const maxDescriptionBytes = 900

for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const skillName = entry.name
  const skillRoot = join(skillsRoot, skillName)
  const skillPath = join(skillRoot, 'SKILL.md')
  const englishReadmePath = join(skillRoot, 'README.md')
  const chineseReadmePath = join(skillRoot, 'README_ZH.md')
  const evalPath = join(skillRoot, 'evals', 'evals.json')

  for (const requiredPath of [skillPath, englishReadmePath, chineseReadmePath, evalPath]) {
    if (!existsSync(requiredPath)) errors.push(`${relativePath(requiredPath)}: missing required file`)
  }
  if (![skillPath, englishReadmePath, chineseReadmePath, evalPath].every(existsSync)) continue

  const skillMarkdown = readFileSync(skillPath, 'utf8')
  const frontmatter = readFrontmatter(skillMarkdown, relativePath(skillPath))
  const frontmatterName = frontmatterField(frontmatter, 'name')
  const description = frontmatterField(frontmatter, 'description')

  if (frontmatterName !== skillName) {
    errors.push(`${relativePath(skillPath)}: name '${frontmatterName}' does not match directory '${skillName}'`)
  }
  if (!description) errors.push(`${relativePath(skillPath)}: missing frontmatter description`)
  if (skillName.length >= maxSkillNameCharacters) {
    errors.push(`${relativePath(skillPath)}: name must be shorter than ${maxSkillNameCharacters} characters`)
  }
  if (Buffer.byteLength(description, 'utf8') > maxDescriptionBytes) {
    errors.push(`${relativePath(skillPath)}: description exceeds ${maxDescriptionBytes} UTF-8 bytes`)
  }
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(skillName)) {
    errors.push(`${relativePath(skillPath)}: directory name is not kebab-case`)
  }

  validateEval(evalPath, skillName)
  validateReadme(englishReadmePath, skillName)
  validateReadme(chineseReadmePath, skillName)
  validateChineseCompanion(chineseReadmePath, skillPath, skillName)
}

for (const assetRoot of [rulesRoot, designRoot]) {
  validateFlatAssets(assetRoot)
}

for (const path of [
  join(repositoryRoot, 'README.md'),
  join(repositoryRoot, 'AGENTS.md'),
  ...markdownFiles(skillsRoot),
  ...markdownFiles(rulesRoot),
  ...markdownFiles(designRoot),
]) {
  const markdown = readFileSync(path, 'utf8')
  if (/deweyou\/agents|github\.com\/deweyou\/agents|code_github\/agents/.test(markdown)) {
    errors.push(`${relativePath(path)}: stale former-repository reference`)
  }
  if (markdown.includes(formerCliName)) {
    errors.push(`${relativePath(path)}: repository-specific CLI coupling is not allowed`)
  }
}

if (errors.length > 0) {
  console.error('Skill validation failed:')
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

const skillCount = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
const ruleCount = markdownFiles(rulesRoot).length
const designCount = markdownFiles(designRoot).length
console.log(`Validated ${skillCount} skills, ${ruleCount} rules, and ${designCount} design ${designCount === 1 ? 'contract' : 'contracts'}.`)

function readFrontmatter(markdown, source) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) {
    errors.push(`${source}: missing or unclosed YAML frontmatter`)
    return ''
  }
  return match[1]
}

function frontmatterField(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'))
  if (!match) return ''

  const inlineValue = match[1].trim()
  if (inlineValue && inlineValue !== '>' && inlineValue !== '|') return inlineValue
  if (inlineValue !== '>' && inlineValue !== '|') return ''

  const valueStart = match.index + match[0].length
  return readIndentedBlock(frontmatter.slice(valueStart).replace(/^\n/, ''))
}

function readIndentedBlock(markdown) {
  const lines = []
  for (const line of markdown.split('\n')) {
    if (!/^\s+/.test(line)) break
    lines.push(line.trim())
  }
  return lines.join(' ').trim()
}

function validateEval(evalPath, skillName) {
  try {
    const evalSuite = JSON.parse(readFileSync(evalPath, 'utf8'))
    if (evalSuite.skill_name !== skillName) {
      errors.push(`${relativePath(evalPath)}: skill_name '${evalSuite.skill_name ?? ''}' does not match '${skillName}'`)
    }
    if (!Array.isArray(evalSuite.evals) || evalSuite.evals.length === 0) {
      errors.push(`${relativePath(evalPath)}: evals must be a non-empty array`)
      return
    }

    const evalIds = new Set()
    for (const [index, evalCase] of evalSuite.evals.entries()) {
      const casePath = `${relativePath(evalPath)}: evals[${index}]`
      if (!Number.isInteger(evalCase.id)) {
        errors.push(`${casePath}: id must be an integer`)
      } else if (evalIds.has(evalCase.id)) {
        errors.push(`${casePath}: duplicate id ${evalCase.id}`)
      } else {
        evalIds.add(evalCase.id)
      }
      if (typeof evalCase.prompt !== 'string' || evalCase.prompt.trim() === '') {
        errors.push(`${casePath}: prompt must be a non-empty string`)
      }
      if (typeof evalCase.expected_output !== 'string' || evalCase.expected_output.trim() === '') {
        errors.push(`${casePath}: expected_output must be a non-empty string`)
      }
      if (!Array.isArray(evalCase.expectations) || evalCase.expectations.length === 0) {
        errors.push(`${casePath}: expectations must be a non-empty array`)
      } else if (evalCase.expectations.some((expectation) => typeof expectation !== 'string' || expectation.trim() === '')) {
        errors.push(`${casePath}: expectations must contain only non-empty strings`)
      }
    }
  } catch (error) {
    errors.push(`${relativePath(evalPath)}: invalid JSON: ${error.message}`)
  }
}

function validateFlatAssets(assetRoot) {
  for (const path of markdownFiles(assetRoot)) {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    const expectedName = filename.replace(/\.md$/, '')
    const markdown = readFileSync(path, 'utf8')
    const frontmatter = readFrontmatter(markdown, relativePath(path))
    const name = frontmatterField(frontmatter, 'name')
    const description = frontmatterField(frontmatter, 'description')

    if (name !== expectedName) {
      errors.push(`${relativePath(path)}: name '${name}' does not match filename '${expectedName}'`)
    }
    if (!description) errors.push(`${relativePath(path)}: missing frontmatter description`)
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(expectedName)) {
      errors.push(`${relativePath(path)}: filename is not kebab-case`)
    }
  }
}

function validateReadme(readmePath, skillName) {
  const markdown = readFileSync(readmePath, 'utf8')
  const installCommand = `npx skills add deweyou/skills --skill ${skillName}`
  if (!markdown.includes(installCommand)) {
    errors.push(`${relativePath(readmePath)}: missing install command '${installCommand}'`)
  }
  if (!markdown.includes('deweyou/skills')) {
    errors.push(`${relativePath(readmePath)}: missing deweyou/skills source reference`)
  }
}

function validateChineseCompanion(chineseReadmePath, skillPath, skillName) {
  const markdown = readFileSync(chineseReadmePath, 'utf8')
  const metadata = markdown.match(/^<!-- Chinese reading companion\n([\s\S]*?)\n-->/)?.[1] ?? ''
  const expectedSource = `skills/${skillName}/SKILL.md`
  const actualSource = metadata.match(/^source:\s*(.+)$/m)?.[1] ?? ''
  const actualDigest = metadata.match(/^source-digest:\s*(.+)$/m)?.[1] ?? ''
  const expectedDigest = `sha256:${createHash('sha256').update(readFileSync(skillPath)).digest('hex')}`

  if (actualSource !== expectedSource) {
    errors.push(`${relativePath(chineseReadmePath)}: source '${actualSource}' does not match '${expectedSource}'`)
  }
  if (actualDigest !== expectedDigest) {
    errors.push(`${relativePath(chineseReadmePath)}: stale source-digest; expected ${expectedDigest}`)
  }
  if (!/^translation-status:\s*current$/m.test(metadata)) {
    errors.push(`${relativePath(chineseReadmePath)}: translation-status must be current`)
  }
  if (!/^description:\s*\S+/m.test(metadata)) {
    errors.push(`${relativePath(chineseReadmePath)}: missing Chinese description`)
  }
}

function markdownFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : []
  })
}

function relativePath(path) {
  return path.slice(repositoryRoot.length + 1)
}
