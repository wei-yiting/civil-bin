import { useEffect, useState } from 'react'
import { dateKey } from './domain'
import {
  resetData,
  storageWarning,
  useData,
  useCloudStatus,
} from './persistence'
import { CloudPanel } from './CloudPanel'
import { Citizen } from './Citizen'
import { Merchant } from './Merchant'
import { City } from './City'
import './App.css'
import './mobile.css'

const roles = [
  { id: 'citizen', name: '民眾端', icon: '⌖', detail: '找據點・拍照交付' },
  { id: 'merchant', name: '店家端', icon: '▤', detail: '收受管理・每日申報' },
  { id: 'city', name: '市府端', icon: '▥', detail: '交叉查核・量能分析' },
] as const
type Role = (typeof roles)[number]['id']
function currentRole(): Role {
  const hash = location.hash.slice(1)
  return hash === 'merchant' || hash === 'city' ? hash : 'citizen'
}
export type Notify = (message: string) => void

export default function App() {
  const data = useData()
  const cloud = useCloudStatus()
  const [role, setRole] = useState<Role>(currentRole)
  const [message, setMessage] = useState(storageWarning)
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    const sync = () => setRole(currentRole())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const allowedRole =
    !cloud.configured || role === 'citizen' || cloud.role === role
  const visibleRole = allowedRole ? role : 'citizen'
  const merchantData = cloud.configured
    ? {
        ...data,
        stores: data.stores.filter((store) =>
          cloud.storeIds.includes(store.id),
        ),
        deliveries: data.deliveries.filter((delivery) =>
          cloud.storeIds.includes(delivery.storeId),
        ),
      }
    : data
  const active = roles.find((r) => r.id === visibleRole)!
  function navigate(next: Role) {
    window.location.assign('#' + next)
    setRole(next)
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `civil-bin-${dateKey()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('示範資料已匯出，內含此瀏覽器儲存的照片，請妥善保管。')
  }
  return (
    <div className={`shell role-${visibleRole}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">♲</span>
          <div>
            <b>Civil Bin</b>
            <small>我們的垃圾桶</small>
          </div>
        </div>
        <div className="side-label">試辦服務平台</div>
        <nav aria-label="角色切換">
          {roles.map((r) => (
            <button
              key={r.id}
              aria-current={visibleRole === r.id ? 'page' : undefined}
              aria-label={r.name}
              className={`nav ${visibleRole === r.id ? 'active' : ''}`}
              disabled={
                cloud.configured && r.id !== 'citizen' && cloud.role !== r.id
              }
              onClick={() => navigate(r.id)}
            >
              <span className="navicon">{r.icon}</span>
              <span>
                <b>{r.name}</b>
                <small>{r.detail}</small>
              </span>
              <span className="navarrow">›</span>
            </button>
          ))}
        </nav>
        <div className="side-note">
          <span className="tinycaps">一起讓城市更乾淨</span>
          <h3>
            小店的空間，
            <br />
            城市的善意。
          </h3>
          <p>
            串連街角小店與行人，
            <br />
            讓每一筆垃圾需求都被看見。
          </p>
          <span className="side-pill">● 黑客松展示版</span>
        </div>
        <div className="sidebar-bottom">
          臺北市行人垃圾服務
          <br />
          <span>官方清潔箱位置・店家示範資料</span>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>
            Civil Bin <span className="slash">/</span> <b>{active.name}</b>
          </span>
          <span className="top-date">
            {dateKey()}{' '}
            <span className="badge">
              {cloud.configured ? '雲端共享' : '本機共享示範'}
            </span>
          </span>
        </div>
        <main>
          <CloudPanel />
          {cloud.configured && !cloud.ready && (
            <p role="status">等待雲端資料，請檢查連線或 Supabase 設定。</p>
          )}
          {cloud.ready && data.stores.length === 0 && (
            <p role="status">
              目前尚無合作店家。店家帳號登入後可登錄店家；管理員也可匯入示範資料。
            </p>
          )}
          {!allowedRole && (
            <p role="alert">此角色需要授權帳號，請先在連線面板登入。</p>
          )}
          {message && (
            <div className="toast" role="status">
              <span>{message}</span>
              <button aria-label="關閉訊息" onClick={() => setMessage('')}>
                ×
              </button>
            </div>
          )}
          {cloud.ready &&
            data.stores.length > 0 &&
            visibleRole === 'citizen' && (
              <Citizen data={data} notify={setMessage} />
            )}
          {cloud.ready && visibleRole === 'merchant' && (
            <Merchant data={merchantData} notify={setMessage} />
          )}
          {cloud.ready && data.stores.length > 0 && visibleRole === 'city' && (
            <City data={data} notify={setMessage} />
          )}
          <footer>
            <div>
              <b>Civil Bin</b>
              <p>
                使用尺寸板人工登記與店家確認，不使用 AI、不由平面尺寸換算公升。
                <br />
                {cloud.configured
                  ? '資料儲存於 Supabase，跨裝置同步；照片僅供授權者讀取。'
                  : '照片與資料只儲存在此瀏覽器；同來源分頁同步，跨裝置不共享。角色切換僅供展示。'}
              </p>
            </div>
            <div className="footer-actions">
              <button className="text-button" onClick={exportData}>
                匯出示範資料 ↓
              </button>
              <button
                className="text-button"
                disabled={cloud.configured}
                onClick={() => setConfirmReset(true)}
              >
                重設示範資料
              </button>
            </div>
          </footer>
        </main>
      </div>
      {confirmReset && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">重設這個瀏覽器的示範資料？</h2>
            <p>會移除本機新增的照片、收受與申報紀錄。建議先匯出備份。</p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setConfirmReset(false)}
              >
                取消
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  try {
                    await resetData()
                    setConfirmReset(false)
                    setMessage('示範資料已重設。')
                  } catch (e) {
                    setMessage((e as Error).message)
                  }
                }}
              >
                確認重設
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
