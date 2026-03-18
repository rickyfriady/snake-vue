import { existsSync, readFileSync } from 'node:fs'

import { danger, fail, message, warn } from 'danger'

const changedFiles = [...danger.git.created_files, ...danger.git.modified_files]
const sourceFiles = changedFiles.filter((file) => file.startsWith('src/'))
const sourceCodeFiles = sourceFiles.filter((file) => /\.(?:ts|tsx|js|jsx|vue)$/.test(file))
const testFiles = changedFiles.filter((file) => /\.test\.(?:ts|tsx|js|jsx)$/.test(file))
const docsTouched = changedFiles.some((file) => file === 'README.md' || file === 'CHANGE_LOG.md')
const configFilesTouched = changedFiles.some((file) =>
  [
    'package.json',
    'bun.lock',
    'biome.json',
    'eslint.config.mjs',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
  ].includes(file),
)

if (sourceFiles.length === 0) {
  warn('No `src/` files were modified.')
}

if (sourceCodeFiles.length > 0 && testFiles.length === 0) {
  fail('Source code changed without corresponding unit test updates.')
}

if (sourceFiles.length > 0 && !docsTouched) {
  fail('`README.md` or `CHANGE_LOG.md` must be updated when `src/` changes.')
}

if (configFilesTouched && !docsTouched) {
  warn('Build/tooling config changed without docs/changelog update.')
}

if (changedFiles.includes('package.json') && !changedFiles.includes('bun.lock')) {
  fail('`package.json` changed but `bun.lock` was not updated.')
}

if (changedFiles.length > 30) {
  warn('Large change set detected (>30 files). Consider splitting the PR.')
}

for (const file of sourceCodeFiles) {
  if (file.endsWith('.test.ts') || file.endsWith('.test.js')) {
    continue
  }

  if (!existsSync(file)) {
    continue
  }

  const content = readFileSync(file, 'utf8')

  if (/\bconsole\.(?:log|debug|info)\(/.test(content)) {
    fail(`Production source must not include console logging: ${file}`)
  }

  if (/\bdebugger\b/.test(content)) {
    fail(`Production source must not include debugger statements: ${file}`)
  }
}

if (testFiles.length > 0) {
  message(`Test updates detected (${testFiles.length} file(s)).`)
}
