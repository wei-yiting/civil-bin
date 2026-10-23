import { useState } from 'react'
import { cloudSignIn, cloudSignOut } from './cloud'
import { refreshCloud, useCloudStatus } from './persistence'

export function CloudPanel() {
  const status = useCloudStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!status.configured) return null
  async function perform(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await action()
      await refreshCloud()
      setPassword('')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="card cloud-panel">
      <summary>{status.message}</summary>
      <p>
        {status.email || '尚未登入'} ·{' '}
        {{ citizen: '民眾', merchant: '店家', city: '市府' }[status.role]}
      </p>
      <p>民眾使用匿名身分。店家與市府須使用管理員建立並授權的帳號。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void perform(() => cloudSignIn(email, password))
        }}
      >
        <label>
          帳號 Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <div className="button-row">
          <button className="button secondary" disabled={busy} type="submit">
            登入授權帳號
          </button>
          <button
            className="button secondary"
            disabled={busy}
            type="button"
            onClick={() => {
              void perform(cloudSignOut)
            }}
          >
            登出並改用民眾身分
          </button>
          <button
            className="text-button"
            disabled={busy}
            type="button"
            onClick={() => {
              void perform(refreshCloud)
            }}
          >
            重新連線
          </button>
        </div>
      </form>
      {message && <p role="alert">{message}</p>}
      {!status.ready && (
        <p role="alert">雲端未連線，無法送出資料；不會切回本機儲存。</p>
      )}
    </details>
  )
}
