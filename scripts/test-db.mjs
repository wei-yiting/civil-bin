import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const container = `civil-bin-test-${randomUUID().slice(0, 8)}`
function docker(args, input) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (result.error || result.status !== 0)
    throw new Error(
      result.stderr || result.error?.message || 'Docker command failed',
    )
  return result.stdout
}
try {
  docker([
    'run',
    '--name',
    container,
    '--rm',
    '-d',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:16-alpine',
    '-c',
    'wal_level=logical',
  ])
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'postgres'],
      { encoding: 'utf8', timeout: 5000 },
    )
    if (result.status === 0) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (!ready) throw new Error('PostgreSQL did not become ready')
  for (const path of [
    'supabase/tests/bootstrap.sql',
    'supabase/migrations/202610240001_civil_bin.sql',
    'supabase/tests/permissions.sql',
  ]) {
    const sql = await readFile(path, 'utf8')
    docker(
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
      ],
      sql,
    )
    console.log(`Passed: ${path}`)
  }
  console.log(
    'Isolated PostgreSQL schema, permissions, delivery and claim checks passed. Auth/Storage service stubs are used; this does not replace hosted Supabase verification.',
  )
} finally {
  spawnSync('docker', ['rm', '-f', container], {
    encoding: 'utf8',
    timeout: 15_000,
  })
}
