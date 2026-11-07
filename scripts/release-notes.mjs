#!/usr/bin/env node
/**
 * release-notes.mjs — 由 CHANGELOG.md 组装 GitHub Release 正文。
 *
 * 发布正文的来源是仓库里的 `## [<版本>]` 小节：脚本把它抄进来，再接一段固定的安装块。
 * 缺小节不算失败（紧急修复仍要能发），但会退化成提交列表并在 stderr 说明。
 *
 * 用法（见 .github/workflows/release.yml）：
 *   node scripts/release-notes.mjs \
 *     --version v0.1.0 --changelog CHANGELOG.md \
 *     --commits commits.txt --sha <commit> --out release-notes.md
 *
 * `--commits` 是工作流用 `git log` 生成的纯文本，脚本自己不碰 git：
 *   node scripts/release-notes.mjs --version 0.1.0 --out -   # 打到 stdout，不写文件
 */
import { readFileSync, writeFileSync } from 'node:fs'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

const version = String(arg('version', '')).trim().replace(/^v/, '')
const changelogPath = arg('changelog', 'CHANGELOG.md')
const commitsPath = arg('commits')
const sha = arg('sha', '')
const outPath = arg('out', 'release-notes.md')

if (version === '') {
  console.error('release-notes: --version is required')
  process.exit(2)
}

/** Escape a version for use inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The body of `## [<version>]`, up to the next `## ` heading.
 * @returns the section text, or null when the changelog has no such section.
 */
export function sectionFrom(markdown, wanted) {
  const lines = markdown.split(/\r?\n/)
  const heading = new RegExp(`^##\\s*\\[${escapeRegExp(wanted)}\\]`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return null
  const body = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break
    body.push(lines[index])
  }
  const text = body.join('\n').trim()
  return text === '' ? null : text
}

function readIfPresent(file) {
  if (file === undefined) return null
  try {
    const text = readFileSync(file, 'utf8').trim()
    return text === '' ? null : text
  } catch {
    return null
  }
}

const fromChangelog = (() => {
  const markdown = readIfPresent(changelogPath)
  return markdown === null ? null : sectionFrom(markdown, version)
})()

let changes
if (fromChangelog !== null) {
  changes = fromChangelog
} else {
  console.error(`release-notes: no "## [${version}]" section in ${changelogPath}; falling back to the commit list`)
  const commits = readIfPresent(commitsPath)
  changes = commits === null
    ? `> ${changelogPath} 中没有 ${version} 的小节，也没有可用的提交列表。`
    : `> ${changelogPath} 中没有 ${version} 的小节，以下为该标签包含的提交：\n\n${commits}`
}

const pinned = sha === '' ? '' : `#${sha}`
const body = [
  '## 更新内容',
  '',
  changes,
  '',
  '## 安装',
  '',
  '```sh',
  '# 从 tarball（本 Release 附件）',
  `dsh plugin --profile web add ./dsh-gfm-alerts-${version}.tgz`,
  '',
  '# 或从仓库安装（锁定提交以固定内容）',
  `dsh plugin --profile web add github:NEVSTOP-LAB/dsh-gfm-alerts${pinned}`,
  '```',
  '',
  '`--profile web` 是默认 profile。',
  '安装后**重启 DSH 并刷新页面**，提示块才会换样式。',
  '详见 [README](https://github.com/NEVSTOP-LAB/dsh-gfm-alerts#readme)。',
  '',
].join('\n')

if (outPath === '-') {
  process.stdout.write(body)
} else {
  writeFileSync(outPath, body, 'utf8')
  console.log(`release-notes: wrote ${outPath} (${fromChangelog !== null ? `CHANGELOG section ${version}` : 'commit-list fallback'})`)
}
