// Bundle-size budget: fails CI if the shipped demo bloats past what a
// classroom connection should have to download. Run after `npm run build`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const BUDGETS_GZIP = { '.js': 100_000, '.css': 20_000, '.html': 30_000 }

let failed = false
const totals = {}
for (const file of readdirSync(join(DIST, 'assets')).map((f) => join('assets', f)).concat('index.html')) {
  const ext = file.slice(file.lastIndexOf('.'))
  if (!(ext in BUDGETS_GZIP)) continue
  totals[ext] = (totals[ext] ?? 0) + gzipSync(readFileSync(join(DIST, file))).length
}
for (const [ext, budget] of Object.entries(BUDGETS_GZIP)) {
  const size = totals[ext] ?? 0
  const ok = size <= budget
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${ext.padEnd(5)} ${size} B gzipped (budget ${budget} B)`)
  if (!ok) failed = true
}
if (failed) {
  console.error('Bundle-size budget exceeded — see above.')
  process.exit(1)
}
