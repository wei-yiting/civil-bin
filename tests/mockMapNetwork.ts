import type { BrowserContext } from '@playwright/test'
import snapshot from '../src/data/public-bins.json' with { type: 'json' }

export async function mockMapNetwork(context: BrowserContext) {
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee7"/><path d="M0 128h256M128 0v256" stroke="#fff" stroke-width="12"/></svg>',
    }),
  )
  await context.route('**/api/public-bins', (route) =>
    route.fulfill({ json: snapshot }),
  )
}
