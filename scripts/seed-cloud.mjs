import { createServer } from 'vite'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
const server = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
})
try {
  const { seedState } = await server.ssrLoadModule('/src/domain.ts')
  const state = seedState()
  const sample =
    'data:image/svg+xml;base64,' +
    (
      await readFile(new URL('../src/assets/sample-waste.svg', import.meta.url))
    ).toString('base64')
  const literal = (value) =>
    `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
  const text = (value) => `'${value.replaceAll("'", "''")}'`
  const lines = [
    '-- Demonstration data only. Existing records are not overwritten.',
    'begin;',
  ]
  for (const store of state.stores)
    lines.push(
      `insert into public.civil_stores(id,data) values(${text(store.id)},${literal(store)}) on conflict(id) do nothing;`,
    )
  for (const delivery of state.deliveries) {
    delivery.id = `${delivery.id}-${delivery.date}`
    delivery.photo = sample
    lines.push(
      `insert into public.civil_deliveries(id,store_id,data) values(${text(delivery.id)},${text(delivery.storeId)},${literal(delivery)}) on conflict(id) do nothing;`,
    )
  }
  for (const [id, amount] of Object.entries(state.claims))
    lines.push(
      `insert into public.civil_claims(id,store_id,amount) values(${text(id)},${text(id.slice(11))},${Number(amount)}) on conflict(id) do nothing;`,
    )
  lines.push('commit;')
  await mkdir('supabase', { recursive: true })
  await writeFile('supabase/seed.sql', lines.join('\n') + '\n')
  console.log(
    `Generated supabase/seed.sql: ${state.stores.length} stores, ${state.deliveries.length} deliveries. No existing records overwritten.`,
  )
} finally {
  await server.close()
}
