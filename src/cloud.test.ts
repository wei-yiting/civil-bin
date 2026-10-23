import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedState } from './domain'
const sb = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInAnonymously: vi.fn(),
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  rpc: vi.fn(),
  storage: { from: vi.fn() },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => sb }))
const upload = vi.fn(),
  remove = vi.fn(),
  createSignedUrl = vi.fn()
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key')
  sb.auth.getUser.mockResolvedValue({
    data: { user: { id: 'citizen-id' } },
    error: null,
  })
  sb.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'citizen-id' } } },
    error: null,
  })
  sb.storage.from.mockReturnValue({ upload, remove, createSignedUrl })
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  sb.rpc.mockResolvedValue({ error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('Supabase transport', () => {
  it('雲端拒絕時回報失敗，不另存本機', async () => {
    const { cloudSave } = await import('./cloud')
    const before = seedState(),
      after = structuredClone(before)
    after.stores[0].enabled = false
    sb.rpc.mockResolvedValue({ error: { message: '無權管理此店家' } })
    await expect(cloudSave(before, after)).rejects.toThrow('無權管理此店家')
    expect(sb.rpc).toHaveBeenCalledWith('civil_apply_changes', {
      changes: [
        expect.objectContaining({ table: 'stores', id: before.stores[0].id }),
      ],
    })
  })
  it('照片上傳成功但交易失敗時清理孤立檔案', async () => {
    const { cloudSave } = await import('./cloud')
    const before = seedState(),
      after = structuredClone(before)
    after.deliveries.unshift({
      ...before.deliveries[0],
      id: 'new-delivery',
      status: 'pending',
      photo: 'data:image/jpeg;base64,aGVsbG8=',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: async () => new Blob(['hello'], { type: 'image/jpeg' }),
      }),
    )
    sb.rpc.mockResolvedValue({ error: { message: '店家已停收' } })
    await expect(cloudSave(before, after)).rejects.toThrow('店家已停收')
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^citizen-id\//),
      expect.any(Blob),
      { contentType: 'image/jpeg', upsert: false },
    )
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]])
  })
  it('更新收受結果時不把短效照片網址寫回 DB', async () => {
    const { cloudSave } = await import('./cloud')
    const before = seedState(),
      after = structuredClone(before)
    before.deliveries[0].photo = 'https://signed.example/photo'
    after.deliveries[0].photo = before.deliveries[0].photo
    after.deliveries[0].status = 'rejected'
    await cloudSave(before, after)
    const change = sb.rpc.mock.calls[0][1].changes[0]
    expect(change.value).not.toHaveProperty('photo')
    expect(change.expected).not.toHaveProperty('photo')
    expect(upload).not.toHaveBeenCalled()
  })
  it('讀取雲端快照，私有照片取得短效連結', async () => {
    const { cloudLoad } = await import('./cloud')
    const state = seedState()
    state.deliveries[0].photo = 'storage:citizen-id/photo-id'
    sb.rpc.mockResolvedValue({
      data: { state, role: 'citizen', storeIds: [] },
      error: null,
    })
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/photo' },
      error: null,
    })
    const result = await cloudLoad()
    expect(result.state.deliveries[0].photo).toBe(
      'https://signed.example/photo',
    )
    expect(result.status.ready).toBe(true)
    expect(createSignedUrl).toHaveBeenCalledWith('citizen-id/photo-id', 3600)
  })
})
