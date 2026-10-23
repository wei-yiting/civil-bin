import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
await rm(new URL('../work/functions-smoke', import.meta.url), {
  recursive: true,
  force: true,
})
const compile = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.functions.json'],
  { encoding: 'utf8' },
)
if (compile.status !== 0) throw new Error(compile.stdout || compile.stderr)
const { default: handler } =
  await import('../work/functions-smoke/api/public-bins.js')
if (typeof handler !== 'function')
  throw new Error('Compiled Vercel handler failed to load.')
let code = 0,
  body = ''
await handler(
  { method: 'POST' },
  {
    setHeader() {},
    set statusCode(value) {
      code = value
    },
    end(value) {
      body = value
    },
  },
)
if (code !== 405 || !JSON.parse(body).error)
  throw new Error('Compiled handler failed to respond.')
console.log(
  'Compiled Node ESM function loads and responds with expected method guard.',
)
