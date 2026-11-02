#!/usr/bin/env node
/**
 * pack.mjs — 跨平台打包：确保 dist/ 存在，再 `npm pack` 到该目录。
 * CI、Release 与本地都用它。
 */
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(path.join(root, 'dist'), { recursive: true })

const result = spawnSync('npm', ['pack', '--pack-destination', path.join(root, 'dist')], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status === null ? 1 : result.status)
