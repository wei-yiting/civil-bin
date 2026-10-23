import type { PublicBin } from './bin-data'
import type { Store } from './domain'
import { isOpen } from './domain'
import type { Coordinates } from './geo'
import { hasCoordinates, haversineMeters } from './geo'

export type NearbyPlace =
  | { type: 'store'; place: Store; distance: number; open: boolean }
  | { type: 'bin'; place: PublicBin; distance: number; open: true }

export function partitionNearby(entries: readonly NearbyPlace[]) {
  const ordered = entries
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance >= 0)
    .toSorted((a, b) => a.distance - b.distance)
  return {
    nearby: ordered.filter((entry) => entry.distance <= 1000 && entry.open),
    other: ordered.filter((entry) => entry.distance > 1000 || !entry.open),
  }
}

export function nearbyPlaces(
  origin: Coordinates,
  stores: readonly Store[],
  bins: readonly PublicBin[],
  now: Date,
) {
  const entries: NearbyPlace[] = []
  for (const store of stores) {
    if (hasCoordinates(store))
      entries.push({
        type: 'store',
        place: store,
        distance: haversineMeters(origin, store),
        open: isOpen(store, now),
      })
  }
  for (const bin of bins) {
    if (hasCoordinates(bin))
      entries.push({
        type: 'bin',
        place: bin,
        distance: haversineMeters(origin, bin),
        open: true,
      })
  }
  return partitionNearby(entries)
}
