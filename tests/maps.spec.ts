import { mockMapNetwork } from './mockMapNetwork'
import { test, expect } from '@playwright/test'

test('Leaflet 地圖跨角色重新建立時沒有繪圖錯誤', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('geo-map')).toBeVisible()
  for (const role of ['市府端', '店家端', '民眾端']) {
    await page.getByRole('button', { name: role, exact: true }).click()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
  }
  await expect(page.getByRole('button', { name: '定位我的位置' })).toBeVisible()
  expect(errors).toEqual([])
})

test.beforeEach(async ({ page, context }) => {
  await mockMapNetwork(context)
  await page.route('**/api/public-bins', (route) => route.abort())
  await page.clock.install({ time: new Date('2026-10-24T10:00:00+08:00') })
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee7"/><path d="M0 128h256M128 0v256" stroke="#fff" stroke-width="12"/></svg>',
    }),
  )
  await page.route('https://data.taipei/api/dataset/**/download', (route) =>
    route.abort(),
  )
})

test('手機定位、地圖移動縮放與官方公共清潔箱', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({
    latitude: 25.0588,
    longitude: 121.5434,
    accuracy: 25,
  })
  await page.goto('/')
  await page.getByRole('button', { name: '定位我的位置', exact: true }).click()
  await expect(page.getByText(/定位精度約 25 公尺/)).toBeVisible()
  const map = page.getByTestId('geo-map')
  await expect(map).toHaveAttribute('data-zoom', /\d+/)
  const before = await map.getAttribute('data-center')
  await map.focus()
  await map.press('ArrowRight')
  await expect(map).not.toHaveAttribute('data-center', before!)
  const zoom = Number(await map.getAttribute('data-zoom'))
  await page.getByRole('button', { name: '放大地圖', exact: true }).click()
  await expect(map).toHaveAttribute('data-zoom', String(zoom + 1))
  await page.getByLabel('顯示公共垃圾桶').check()
  await expect(page.getByTestId('bin-source')).toContainText('773')
  await expect(page.getByTestId('bin-source')).toContainText('快照')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('拒絕定位後可繼續搜尋與移動地圖', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => {
      failure?.({
        code: 1,
        message: 'denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '定位我的位置', exact: true }).click()
  await expect(page.getByText(/未取得定位權限/)).toBeVisible()
  await expect(page.getByTestId('geo-map')).toBeVisible()
  await page.getByLabel('搜尋店家或街區').fill('惠姐')
  await expect(
    page.getByRole('button', { name: '地圖：惠姐雜貨店' }),
  ).toBeVisible()
})

test('店家登錄後跨角色與重載仍可找到', async ({ page }) => {
  await page.goto('/#merchant')
  await page.getByRole('button', { name: '登錄我的店家', exact: true }).click()
  await page.getByLabel('店家名稱', { exact: true }).fill('測試街角小店')
  await page
    .getByLabel('店家地址', { exact: true })
    .fill('臺北市中山區測試路一號')
  await page.getByText('手動輸入精確座標').click()
  await page.getByLabel('緯度', { exact: true }).fill('25.0585')
  await page.getByLabel('經度', { exact: true }).fill('121.5425')
  await page.getByRole('button', { name: '完成店家登錄', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('店家已登錄')
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: '選擇合作店家', exact: true }),
  ).toContainText('測試街角小店')
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await page.getByLabel('搜尋店家或街區').fill('測試街角小店')
  await expect(
    page.getByRole('button', { name: '地圖：測試街角小店' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '市府端', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '測試街角小店' }),
  ).toContainText('尚未申報')
})

test('市府全區地圖可切換申報量與行政區圖層', async ({ page }) => {
  await page.goto('/#city')
  await expect(page.getByTestId('bin-source')).toContainText('773')
  await page
    .getByRole('combobox', { name: '地圖顯示數值', exact: true })
    .selectOption('claims')
  await expect(page.getByText(/773 個官方位置・24 個合作點/)).toBeVisible()
  await page
    .getByRole('combobox', { name: '地圖行政區', exact: true })
    .selectOption('松山區')
  await page.getByRole('button', { name: '查看全區', exact: true }).click()
  await page.getByTestId('geo-map').focus()
  await page.getByTestId('geo-map').press('+')
  await page
    .getByRole('combobox', { name: '地圖行政區', exact: true })
    .selectOption('')
  await page
    .getByRole('row')
    .filter({ hasText: '惠姐雜貨店' })
    .getByRole('button', { name: '查核詳情' })
    .click()
  await page
    .getByRole('row')
    .filter({ hasText: '阿明早餐店' })
    .getByRole('button', { name: '查核詳情' })
    .click()
  await expect(
    page.getByRole('button', { name: '地圖：阿明早餐店', exact: true }),
  ).toHaveText('—')
  await page
    .getByRole('combobox', { name: '地圖顯示數值', exact: true })
    .selectOption('confirmed')
  await expect(
    page.getByRole('button', { name: '地圖：阿明早餐店', exact: true }),
  ).toContainText('件')
  await page
    .getByRole('row')
    .filter({ hasText: '惠姐雜貨店' })
    .getByRole('button', { name: '查核詳情' })
    .click()
  await expect(
    page.getByRole('heading', { name: '惠姐雜貨店・查核詳情', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: '地圖行政區', exact: true })
    .selectOption('松山區')
  await expect(
    page.getByRole('combobox', { name: '地圖行政區', exact: true }),
  ).toHaveValue('松山區')
  await page.getByLabel('市府顯示公共垃圾桶').uncheck()
  await page.getByRole('button', { name: '查看全區', exact: true }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
