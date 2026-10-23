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
  const expandLines = [
    '-- Add fictional partner stores and size records; preserve owned/customized shops and all existing records.',
    'begin;',
  ]
  const legacyLabels = [
    '公園口',
    '書街',
    '老街',
    '河岸',
    '樹蔭',
    '晴光',
    '綠巷',
    '車站邊',
    '學院',
    '花園',
    '街角',
    '南園',
    '山腳',
    '廣場',
    '文林',
    '溪畔',
    '溫泉',
    '湖畔',
    '科園',
    '東站',
    '茶香',
  ]
  for (const store of state.stores) {
    expandLines.push(
      `insert into public.civil_stores(id,data) values(${text(store.id)},${literal(store)}) on conflict(id) do nothing;`,
    )
    const legacyIndex = /^demo-\d{2}$/.test(store.id)
      ? Number(store.id.slice(5)) - 1
      : -1
    if (legacyLabels[legacyIndex])
      expandLines.push(
        `update public.civil_stores set data=jsonb_set(data,'{name}',to_jsonb(${text(store.name)}::text)) where id=${text(store.id)} and owner_id is null and data->>'isDemo'='true' and data->>'name'=${text(legacyLabels[legacyIndex] + '夥伴小店（示範）')};`,
      )
  }
  const sizeLines = [
    '-- Incremental demonstration sizes only. Existing records are not overwritten.',
    'begin;',
  ]
  for (const delivery of state.deliveries) {
    delivery.id = `${delivery.id}-${delivery.date}`
    delivery.photo = delivery.source === 'photo' ? sample : null
    const destination = delivery.measurement ? sizeLines : lines
    destination.push(
      `insert into public.civil_deliveries(id,store_id,data) values(${text(delivery.id)},${text(delivery.storeId)},${literal(delivery)}) on conflict(id) do nothing;`,
    )
  }
  for (const [id, amount] of Object.entries(state.claims))
    lines.push(
      `insert into public.civil_claims(id,store_id,amount) values(${text(id)},${text(id.slice(11))},${Number(amount)}) on conflict(id) do nothing;`,
    )
  for (const [id, counts] of Object.entries(state.sizeClaims))
    sizeLines.push(
      `insert into public.civil_size_claims(id,store_id,counts) values(${text(id)},${text(id.slice(11))},${literal(counts)}) on conflict(id) do nothing;`,
    )
  lines.push(...sizeLines.slice(2), 'commit;')
  expandLines.push(
    ...sizeLines.slice(2),
    'commit;',
    "select count(*) as total_stores, count(*) filter (where data->>'isDemo'='true') as fictional_stores from public.civil_stores;",
  )
  sizeLines.push('commit;')
  await mkdir('supabase', { recursive: true })
  await writeFile('supabase/seed.sql', lines.join('\n') + '\n')
  await writeFile('supabase/seed-sizes.sql', sizeLines.join('\n') + '\n')
  await writeFile('supabase/demo-expand.sql', expandLines.join('\n') + '\n')
  const statements = expandLines.filter(
    (line) =>
      !line.startsWith('--') &&
      line !== 'begin;' &&
      line !== 'commit;' &&
      !line.startsWith('select count'),
  )
  const batches = []
  let batch = [],
    bytes = 0
  for (const statement of statements) {
    const length = Buffer.byteLength(statement, 'utf8') + 1
    if (bytes + length > 380000 && batch.length) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(statement)
    bytes += length
  }
  if (batch.length) batches.push(batch)
  await mkdir('supabase/demo-expand-parts', { recursive: true })
  for (const [index, entries] of batches.entries()) {
    const sql =
      [
        `-- Fictional demo expansion: part ${index + 1}/${batches.length}. Run parts in order. Safe to rerun.`,
        'begin;',
        ...entries,
        'commit;',
        'select count(*) as total_stores from public.civil_stores;',
      ].join('\n') + '\n'
    const filename = `supabase/demo-expand-parts/part-${String(index + 1).padStart(2, '0')}.sql`
    await writeFile(filename, sql)
    console.log(`${filename}: ${Buffer.byteLength(sql)} bytes`)
  }
  console.log(
    `Generated supabase/seed.sql: ${state.stores.length} stores, ${state.deliveries.length} deliveries. No existing records overwritten.`,
  )
} finally {
  await server.close()
}
