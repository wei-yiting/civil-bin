import { createClient } from '@supabase/supabase-js'
import { demoSessionStorageKey } from './demo-session'
import { migrateState } from './domain'
import type { State } from './domain'
import { cloudChanges } from './cloud-diff'

export type CloudRole = 'citizen' | 'merchant' | 'city'
export interface CloudStatus {
  configured: boolean
  ready: boolean
  role: CloudRole
  userId: string
  storeIds: string[]
  email: string
  message: string
}
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const cloudConfigured = Boolean(url || key)
let configurationError = ''
export const cloudClient = (() => {
  if (!url || !key) return null
  try {
    const storageKey = demoSessionStorageKey(
      typeof window === 'undefined' ? '' : window.location.search,
      url,
    )
    return createClient(
      url,
      key,
      storageKey ? { auth: { storageKey } } : undefined,
    )
  } catch {
    configurationError = 'Supabase URL 或 publishable key 格式不正確。'
    return null
  }
})()
export const initialCloudStatus: CloudStatus = {
  configured: cloudConfigured,
  ready: !cloudConfigured,
  role: 'citizen',
  userId: '',
  storeIds: [],
  email: '',
  message: cloudConfigured ? '正在連接 Supabase…' : '本機模式：跨裝置不共享',
}
function client() {
  if (!cloudClient)
    throw new Error(
      configurationError ||
        'Supabase 設定不完整，請同時設定 URL 與 publishable key。',
    )
  return cloudClient
}
function check(error: { message: string } | null) {
  if (error) throw new Error(`雲端操作失敗：${error.message}`)
}
export async function cloudLoad(): Promise<{
  state: State
  status: CloudStatus
}> {
  const sb = client()
  let {
    data: { session },
    error,
  } = await sb.auth.getSession()
  check(error)
  if (!session) {
    const result = await sb.auth.signInAnonymously()
    check(result.error)
    session = result.data.session
  }
  if (!session) throw new Error('無法建立登入身分。')
  const result = await sb.rpc('civil_snapshot')
  check(result.error)
  const payload = result.data as {
    state: unknown
    role: CloudRole
    storeIds: string[]
  }
  const state = migrateState(payload.state, false)
  await Promise.all(
    state.deliveries.map(async (delivery) => {
      if (!delivery.photo?.startsWith('storage:')) return
      delivery.photoKey = delivery.photo
      const path = delivery.photo.slice('storage:'.length)
      const signed = await sb.storage
        .from('delivery-photos')
        .createSignedUrl(path, 3600)
      // Only the owner, receiving merchant and city can read the private photo.
      check(signed.error)
      if (!signed.data?.signedUrl)
        throw new Error('無法取得交付照片連結，請重新連線。')
      delivery.photo = signed.data.signedUrl
    }),
  )
  return {
    state,
    status: {
      configured: true,
      ready: true,
      role: payload.role,
      userId: session.user.id,
      storeIds: payload.storeIds,
      email: session.user.email || '匿名民眾',
      message: 'Supabase 已連線・跨裝置同步',
    },
  }
}
export async function cloudSave(before: State, after: State): Promise<void> {
  const sb = client()
  const changes = cloudChanges(before, after)
  if (!changes.length) return
  const {
    data: { user },
    error,
  } = await sb.auth.getUser()
  check(error)
  if (!user) throw new Error('請先登入。')
  const uploaded: string[] = []
  try {
    for (const change of changes) {
      if (change.table !== 'deliveries') continue
      const value = { ...(change.value as Record<string, unknown>) }
      delete value.photoKey
      const expected = change.expected as Record<string, unknown> | null
      // Signed URLs are presentation data, never written back into the database.
      if (expected && value.photo === expected.photo) {
        delete value.photo
        const old = { ...expected }
        delete old.photo
        delete old.photoKey
        change.expected = old
      } else if (
        typeof value.photo === 'string' &&
        value.photo.startsWith('data:image/')
      ) {
        const response = await fetch(value.photo)
        const blob = await response.blob()
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ||
          blob.size > 5 * 1024 * 1024
        )
          throw new Error('照片須為 JPEG、PNG 或 WebP，且不超過 5 MB。')
        const path = `${user.id}/${crypto.randomUUID()}`
        const result = await sb.storage
          .from('delivery-photos')
          .upload(path, blob, { contentType: blob.type, upsert: false })
        check(result.error)
        uploaded.push(path)
        value.photo = `storage:${path}`
      } else if (!expected) value.photo = null
      change.value = value
    }
    const result = await sb.rpc('civil_apply_changes', { changes })
    check(result.error)
  } catch (error) {
    if (uploaded.length)
      await sb.storage.from('delivery-photos').remove(uploaded)
    throw error
  }
}
export async function cloudSignIn(email: string, password: string) {
  const result = await client().auth.signInWithPassword({ email, password })
  check(result.error)
}
export async function cloudSignOut() {
  const result = await client().auth.signOut()
  check(result.error)
}
