import { danger, fail, message, warn } from 'danger'

const changedFiles = [...danger.git.created_files, ...danger.git.modified_files]

if (!changedFiles.some((file) => file.startsWith('src/'))) {
  warn('No `src/` files were modified.')
}

if (
  changedFiles.includes('package.json') &&
  !changedFiles.some((file) => file.startsWith('bun.lock'))
) {
  fail('`package.json` changed but lockfile update was not detected.')
}

if (!changedFiles.some((file) => file.endsWith('.test.ts'))) {
  message('No unit test file changes were detected in this PR.')
}
