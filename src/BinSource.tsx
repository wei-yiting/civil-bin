import type { usePublicBins } from './usePublicBins'

export function BinSource({
  resource,
}: {
  resource: ReturnType<typeof usePublicBins>
}) {
  return (
    <div className="bin-source" data-testid="bin-source">
      <span className="source-dot" />
      <div>
        <b>臺北市環保局・{resource.bins.length} 個設置位置</b>
        <span>
          {resource.loading
            ? '正在檢查官方資料…'
            : resource.source === 'live'
              ? resource.error
                ? '沿用先前連線取得的資料'
                : '已連線取得官方資料'
              : '官方資料快照'}
          ・擷取{' '}
          {new Date(resource.updatedAt).toLocaleString('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
          {resource.error ? '・更新未成功，保留上次資料' : ''}
        </span>
      </div>
      <button
        className="text-button"
        disabled={resource.loading || !resource.canRefresh}
        onClick={resource.refresh}
      >
        {resource.canRefresh ? '更新資料' : '快照版本'}
      </button>
      <a
        href="https://data.gov.tw/dataset/121355"
        target="_blank"
        rel="noreferrer"
      >
        來源 ↗
      </a>
    </div>
  )
}
