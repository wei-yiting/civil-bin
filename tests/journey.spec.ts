import { mockMapNetwork } from './mockMapNetwork'
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context, page }) => {
  await mockMapNetwork(context)
  await page.clock.install({ time: new Date('2026-10-24T10:00:00+08:00') })
})
async function fillDelivery(
  page: import('@playwright/test').Page,
  quantity = 2,
) {
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await page.getByRole('button', { name: '載入示範照片', exact: true }).click()
  await page.getByLabel('交付尺寸級距', { exact: true }).selectOption('S')
  await page.getByLabel('交付件數', { exact: true }).fill(String(quantity))
  await page.getByRole('checkbox', { name: /已用尺寸板逐件對照/ }).check()
  await page.getByRole('button', { name: '送出交付紀錄' }).click()
  await expect(page.getByRole('status')).toContainText('已送出')
}

test('尺寸交付、店家現場修正、每日申報與市府跨分頁同步', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /AI/ })).toHaveCount(0)
  await expect(page.getByTestId('citizen-history')).toContainText('0 筆')
  await fillDelivery(page)
  await expect(
    page.getByTestId('citizen-history').getByText('1 筆', { exact: true }),
  ).toBeVisible()
  const merchant = await context.newPage()
  await merchant.clock.install({ time: new Date('2026-10-24T10:00:00+08:00') })
  await merchant.goto('/#merchant')
  await merchant
    .getByLabel('店家確認尺寸級距', { exact: true })
    .selectOption('M')
  await merchant.getByLabel('店家確認件數', { exact: true }).fill('3')
  await merchant.getByRole('button', { name: '確認收受', exact: true }).click()
  await expect(page.getByTestId('citizen-history')).toContainText('小件 × 2 件')
  await expect(page.getByTestId('citizen-history')).toContainText(
    '店家確認：中件 × 3 件',
  )
  await expect(page.getByTestId('citizen-history')).toContainText('已收受')
  await merchant
    .getByRole('button', { name: '帶入已確認件數', exact: true })
    .click()
  await merchant
    .getByRole('button', { name: '儲存今日尺寸申報', exact: true })
    .click()
  await expect(merchant.getByRole('status')).toContainText('今日尺寸申報已儲存')
  await page.getByRole('button', { name: '市府端', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: '阿明早餐店' })
  await expect(row).toContainText('件數一致')
  await row.getByRole('button', { name: '查核詳情' }).click()
  await page
    .getByLabel('查核備註')
    .fill('尺寸原填與現場確認不同，保留雙方紀錄。')
  await page.getByRole('button', { name: '儲存查核紀錄' }).click()
  await page.reload()
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: '尺寸原填與現場確認不同，保留雙方紀錄。' }),
  ).toBeVisible()
  await expect(
    merchant.getByRole('heading', { name: '阿明早餐店・今日全部收受紀錄' }),
  ).toBeVisible()
  await expect(merchant.getByTestId('merchant-records')).toContainText(
    '中件 × 3 件',
  )
  const acceptedRows = await merchant
    .getByTestId('merchant-records')
    .getByRole('group')
    .count()
  expect(acceptedRows).toBeGreaterThan(1)
  await merchant
    .getByRole('button', { name: '完成今日結算並停收', exact: true })
    .click()
  await expect(merchant.getByRole('status')).toContainText('今日已結算並停收')
  await expect(row).toContainText('今日已停收')
  await expect(row).toContainText('件數一致')
  await expect(
    merchant.getByTestId('merchant-records').getByRole('group'),
  ).toHaveCount(acceptedRows)
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('今日已停收')
  await expect(
    page.getByTestId('citizen-history').getByText('1 筆', { exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('拒收不增加件數、當日停收影響民眾交付', async ({ page }) => {
  await page.goto('/')
  await fillDelivery(page)
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  const before = await page.getByTestId('size-total').textContent()
  await page.getByRole('button', { name: '拒收', exact: true }).click()
  await expect(page.getByTestId('size-total')).toHaveText(before!)
  await page.getByRole('button', { name: '已拒收', exact: true }).click()
  await expect(page.getByTestId('merchant-records')).toContainText(
    '家戶垃圾或不符收受範圍',
  )
  await page.getByRole('button', { name: '今天停止收受', exact: true }).click()
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('今日已停收')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
})

test('尺寸板、照片與人工對照均必要，無效件數不可送出', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '載入示範照片' }).click()
  await page.getByRole('checkbox', { name: /已用尺寸板逐件對照/ }).check()
  await page.getByLabel('交付件數', { exact: true }).fill('0')
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
  await page.getByLabel('交付件數', { exact: true }).fill('2')
  await page.getByLabel('交付尺寸級距', { exact: true }).selectOption('L')
  await expect(
    page.getByRole('checkbox', { name: /已用尺寸板逐件對照/ }),
  ).not.toBeChecked()
  await page.getByText('如何使用隨手垃圾尺寸板？', { exact: true }).click()
  await expect(
    page.getByRole('link', { name: /下載尺寸板原稿/ }),
  ).toHaveAttribute('href', /^data:image\/svg/)
  await expect(page.getByRole('dialog')).toContainText('超過 20 × 30 公分')
})

test('未拍照件數補登、週休與僅顯示尺寸紀錄', async ({ page }) => {
  await page.goto('/#merchant')
  await page.getByLabel('補登尺寸級距', { exact: true }).selectOption('M')
  await page.getByLabel('補登件數', { exact: true }).fill('4')
  await page.getByRole('button', { name: '新增未拍照收受' }).click()
  await page.getByRole('button', { name: '已收受', exact: true }).click()
  await expect(page.getByTestId('merchant-records')).toContainText(
    '中件 × 4 件',
  )
  await expect(page.getByText(/舊版體積/)).toHaveCount(0)
  await page.getByRole('checkbox', { name: '週六收受', exact: true }).uncheck()
  await page.getByRole('button', { name: '儲存收受設定' }).click()
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('今日休息')
})

test('匯出、重設與三端手機版無水平溢出', async ({ page }, testInfo) => {
  await page.goto('/')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出示範資料 ↓' }).click()
  expect((await download).suggestedFilename()).toMatch(/civil-bin.*\.json$/)
  for (const role of ['民眾端', '店家端', '市府端']) {
    await page.getByRole('button', { name: role, exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `docs/screenshots/${role === '民眾端' ? 'citizen' : role === '店家端' ? 'merchant' : 'city'}-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: '重設示範資料', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '重設示範資料', exact: true }).click()
  await page.getByRole('button', { name: '確認重設', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('示範資料已重設')
})
