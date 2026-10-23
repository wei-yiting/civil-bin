import { useNow } from './useNow'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Store } from './domain'
import { isOpen } from './domain'
import type { Coordinates } from './geo'
import { hasCoordinates } from './geo'
import type { PublicBin } from './bin-data'

interface GeoMapProps {
  stores?: Store[]
  bins?: PublicBin[]
  filterToken?: string
  selected?: string
  onSelect?: (id: string) => void
  onBinSelect?: (bin: PublicBin) => void
  location?: Coordinates & { accuracy?: number }
  focusToken?: number
  focus?: Coordinates | null
  picked?: Coordinates | null
  onPick?: (point: Coordinates) => void
  volumes?: Record<string, number>
  valueUnit?: 'L' | '件' | '加權件'
  overview?: boolean
  fitToken?: number
  onCenterChange?: (center: Coordinates) => void
}
const emptyStores: Store[] = []
const emptyBins: PublicBin[] = []
const TAIPEI: L.LatLngExpression = [25.0588, 121.5434]
function tooltip(text: string) {
  const node = document.createElement('div')
  node.textContent = text
  return node
}

export function GeoMap({
  stores = emptyStores,
  bins = emptyBins,
  selected,
  filterToken = '',
  onSelect,
  onBinSelect,
  location,
  focusToken = 0,
  focus,
  picked,
  onPick,
  volumes,
  valueUnit = 'L',
  overview = false,
  fitToken = 0,
  onCenterChange,
}: GeoMapProps) {
  const now = useNow()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const didFit = useRef(false)
  const previousSelected = useRef(selected)
  const callbacks = useRef({ onCenterChange, onPick, onSelect, onBinSelect })
  const [tileError, setTileError] = useState(false)
  useEffect(() => {
    callbacks.current = { onCenterChange, onPick, onSelect, onBinSelect }
  }, [onCenterChange, onPick, onSelect, onBinSelect])
  useEffect(() => {
    const element = container.current!
    const map = L.map(element, {
      center: TAIPEI,
      zoom: overview ? 12 : 15,
      minZoom: 8,
      maxZoom: 19,
      zoomControl: false,
      zoomAnimation: false,
      preferCanvas: false,
      scrollWheelZoom: true,
    })
    mapRef.current = map
    L.control
      .zoom({
        position: 'bottomright',
        zoomInTitle: '放大地圖',
        zoomOutTitle: '縮小地圖',
      })
      .addTo(map)
    const tiles = L.tileLayer(
      import.meta.env.VITE_MAP_TILE_URL ||
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> 貢獻者',
      },
    ).addTo(map)
    tileRef.current = tiles
    tiles.on('tileerror', () => setTileError(true))
    const state = () => {
      const center = map.getCenter()
      element.dataset.center = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`
      element.dataset.zoom = String(map.getZoom())
      callbacks.current.onCenterChange?.({ lat: center.lat, lng: center.lng })
    }
    map.on('moveend zoomend', state)
    map.on('click', (event) =>
      callbacks.current.onPick?.({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      }),
    )
    state()
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    resize.observe(element)
    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
      didFit.current = false
    }
  }, [overview])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = L.layerGroup().addTo(map)
    const storeGroup = L.layerGroup().addTo(map)
    const drawStores = () => {
      storeGroup.clearLayers()
      const positioned = stores.filter((store): store is Store & Coordinates =>
        hasCoordinates(store),
      )
      if (overview && map.getZoom() < 14) {
        const clusters: Array<Array<Store & Coordinates>> = []
        for (const store of positioned) {
          const match = clusters.find(
            (cluster) =>
              map
                .project([cluster[0]!.lat, cluster[0]!.lng])
                .distanceTo(map.project([store.lat, store.lng])) < 70,
          )
          if (match) match.push(store)
          else clusters.push([store])
        }
        for (const cluster of clusters) {
          const lat = cluster.reduce((n, s) => n + s.lat, 0) / cluster.length
          const lng = cluster.reduce((n, s) => n + s.lng, 0) / cluster.length
          const known = cluster
            .map((store) => volumes?.[store.id])
            .filter((v): v is number => Number.isFinite(v))
          const total = known.reduce((n, v) => n + v, 0)
          const value = known.length
            ? (valueUnit !== 'L' ? String(total) : total.toFixed(1)) +
              ` ${valueUnit}` +
              (known.length < cluster.length ? '＋?' : '')
            : '—'
          const marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'store-cluster',
              html: `<strong>${cluster.length} 店</strong><span>${value}</span>`,
              iconSize: [74, 52],
              iconAnchor: [37, 26],
            }),
            keyboard: true,
            bubblingMouseEvents: false,
          })
            .addTo(storeGroup)
            .bindTooltip(tooltip(`${cluster.length} 個合作店家，點選放大查看`))
            .on('click', () =>
              map.fitBounds(
                L.latLngBounds(
                  cluster.map(
                    (store) => [store.lat, store.lng] as L.LatLngTuple,
                  ),
                ),
                { padding: [60, 65], maxZoom: 16, animate: false },
              ),
            )
          marker
            .getElement()
            ?.setAttribute('aria-label', `放大 ${cluster.length} 個合作店家`)
          marker.getElement()?.setAttribute('role', 'button')
        }
        return
      }
      for (const store of stores.filter((s): s is Store & Coordinates =>
        hasCoordinates(s),
      )) {
        const value = volumes?.[store.id]
        const icon = L.divIcon({
          className: `real-store-pin ${selected === store.id ? 'is-selected' : ''} ${isOpen(store) ? '' : 'is-closed'}`,
          html: `<span>${volumes ? (Number.isFinite(value) ? (valueUnit !== 'L' ? String(value) : value!.toFixed(1)) + `<small>${valueUnit}</small>` : '—') : '▤'}</span>`,
          iconSize: [44, 44],
          iconAnchor: [22, 44],
        })
        const marker = L.marker([store.lat, store.lng], {
          icon,
          keyboard: true,
          title: store.name,
          alt: store.name,
          bubblingMouseEvents: false,
        })
          .addTo(storeGroup)
          .bindTooltip(
            tooltip(`${store.name}${store.isDemo ? '（示範店）' : ''}`),
            { direction: 'top', offset: [0, -40] },
          )
          .on('click', () => callbacks.current.onSelect?.(store.id))
        const element = marker.getElement()
        element?.setAttribute('aria-label', `地圖：${store.name}`)
        element?.setAttribute('role', 'button')
      }
    }
    drawStores()
    map.on('zoomend', drawStores)
    const binIcon = L.divIcon({
      className: 'public-bin-pin',
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 23 12 12 23 1 12Z" fill="#913baf" stroke="#fff" stroke-width="2"/><path d="M8 9h8m-6-2h4m-5 3 1 7h4l1-7m-3 1v4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
    for (const bin of bins) {
      const marker = L.marker([bin.lat, bin.lng], {
        icon: binIcon,
        zIndexOffset: -1000,
        title: `公共清潔箱｜${bin.address}`,
        keyboard: true,
        bubblingMouseEvents: false,
      })
        .addTo(group)
        .bindTooltip(
          tooltip(
            `公共清潔箱｜${bin.address}${bin.note ? '・' + bin.note : ''}`,
          ),
        )
      marker
        .getElement()
        ?.setAttribute('aria-label', `公共清潔箱：${bin.address}`)
      marker.getElement()?.setAttribute('role', 'button')
      marker.on('click', () => {
        callbacks.current.onBinSelect?.(bin)
        const popup = document.createElement('div')
        const heading = document.createElement('strong')
        heading.textContent = '公共清潔箱・官方設置位置'
        const detail = document.createElement('p')
        detail.textContent = `${bin.district} ${bin.address}${bin.note ? '（' + bin.note + '）' : ''}`
        const note = document.createElement('small')
        note.textContent = '不提供即時滿溢狀態；現場設置可能異動。'
        popup.append(heading, detail, note)
        L.popup().setLatLng([bin.lat, bin.lng]).setContent(popup).openOn(map)
      })
    }
    return () => {
      map.off('zoomend', drawStores)
      storeGroup.remove()
      group.remove()
    }
  }, [stores, bins, selected, volumes, valueUnit, overview, now])
  useEffect(() => {
    const points = stores.filter((s): s is Store & Coordinates =>
      hasCoordinates(s),
    )
    if (!overview && filterToken.trim() && points.length) {
      mapRef.current?.fitBounds(
        L.latLngBounds(points.map((s) => [s.lat, s.lng] as L.LatLngTuple)),
        { padding: [55, 70], maxZoom: 16, animate: false },
      )
    }
  }, [filterToken, stores, overview])
  const chosen = stores.find((store) => store.id === selected)
  const chosenLat = chosen?.lat
  const chosenLng = chosen?.lng
  useEffect(() => {
    if (
      chosenLat != null &&
      chosenLng != null &&
      (!overview || previousSelected.current !== selected)
    )
      mapRef.current?.setView(
        [chosenLat, chosenLng],
        overview ? 16 : mapRef.current.getZoom(),
        { animate: false },
      )
    previousSelected.current = selected
  }, [chosenLat, chosenLng, overview, selected])
  useEffect(() => {
    if (!location || !mapRef.current) return
    const map = mapRef.current
    const group = L.layerGroup().addTo(map)
    if (location.accuracy)
      L.circle([location.lat, location.lng], {
        radius: Math.min(location.accuracy, 2000),
        color: '#4485c3',
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(group)
    L.circleMarker([location.lat, location.lng], {
      radius: 8,
      color: 'white',
      weight: 3,
      fillColor: '#2777c3',
      fillOpacity: 1,
    })
      .addTo(group)
      .bindTooltip(tooltip('我的位置'))
    map.setView([location.lat, location.lng], 16, { animate: false })
    return () => {
      group.remove()
    }
  }, [location, focusToken])
  useEffect(() => {
    if (focus)
      mapRef.current?.setView([focus.lat, focus.lng], 16, { animate: false })
  }, [focus])
  useEffect(() => {
    if (!picked || !mapRef.current) return
    const map = mapRef.current
    const point = L.circleMarker([picked.lat, picked.lng], {
      radius: 10,
      color: '#c97739',
      fillColor: '#f5bc70',
      fillOpacity: 1,
    }).addTo(map)
    map.panTo([picked.lat, picked.lng], { animate: false })
    return () => {
      point.remove()
    }
  }, [picked])
  useEffect(() => {
    const points: L.LatLngTuple[] = [
      ...bins.map((bin) => [bin.lat, bin.lng] as L.LatLngTuple),
      ...stores
        .filter((s): s is Store & Coordinates => hasCoordinates(s))
        .map((s) => [s.lat, s.lng] as L.LatLngTuple),
    ]
    if (
      !overview ||
      !mapRef.current ||
      !points.length ||
      (didFit.current && fitToken === 0)
    )
      return
    mapRef.current.fitBounds(L.latLngBounds(points), {
      padding: [35, 35],
      maxZoom: 15,
      animate: false,
    })
    didFit.current = true
  }, [overview, bins, stores, fitToken])
  return (
    <div className="geo-map-wrap">
      <div
        ref={container}
        className="geo-map"
        data-testid="geo-map"
        aria-label={onPick ? '點選地圖設定店家位置' : '可拖曳與縮放的互動地圖'}
        tabIndex={0}
      />
      {tileError && (
        <div className="map-network-note" role="status">
          底圖暫時無法載入，位置標記仍可查看。
          <button
            onClick={() => {
              setTileError(false)
              tileRef.current?.redraw()
            }}
          >
            重試底圖
          </button>
        </div>
      )}
    </div>
  )
}
