import { readFileSync, writeFileSync } from 'node:fs'

const pkgPath = new URL('../package.json', import.meta.url)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const parts = pkg.version.split('.').map((n) => parseInt(n, 10))
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  console.error(`Invalid version: ${pkg.version}`)
  process.exit(1)
}

parts[2] += 1
pkg.version = parts.join('.')

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`Bumped version to ${pkg.version}`)