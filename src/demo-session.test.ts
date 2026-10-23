import { expect, it } from 'vitest'
import { demoSessionStorageKey } from './demo-session'

it('展示角色分頁保留各自登入，同一角色仍共用登入且不受hash影響', () => {
  const url = 'https://example.supabase.co'
  const citizen = demoSessionStorageKey('?demoSession=citizen', url)
  const merchant = demoSessionStorageKey('?demoSession=merchant', url)
  const city = demoSessionStorageKey('?demoSession=city', url)
  expect(new Set([citizen, merchant, city]).size).toBe(3)
  expect(demoSessionStorageKey('?demoSession=merchant&x=1', url)).toBe(merchant)
  expect(
    demoSessionStorageKey(
      '?demoSession=merchant',
      'https://another.supabase.co',
    ),
  ).not.toBe(merchant)
  expect(demoSessionStorageKey('', url)).toBeUndefined()
  expect(demoSessionStorageKey('?demoSession=admin', url)).toBeUndefined()
})
