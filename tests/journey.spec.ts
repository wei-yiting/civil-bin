import { mockMapNetwork } from './mockMapNetwork'
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => mockMapNetwork(context))

const demoTime = new Date('2026-10-23T10:00:00+08:00')
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: demoTime })
})

test('照片交付、跨分頁收受、申報與市府查核同步', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '附近哪裡可以丟垃圾？' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await page.getByRole('button', { name: '載入示範照片' }).click()
  await page
    .getByRole('button', { name: '模擬 AI 體積估算', exact: true })
    .click()
  await expect(page.getByTestId('estimate')).toContainText('1.2–2.0')
  await page.getByRole('button', { name: '送出交付紀錄' }).click()
  await expect(page.getByRole('status')).toContainText('已送出')
  const merchant = await context.newPage()
  await merchant.clock.install({ time: demoTime })
  await merchant.goto('/#merchant')
  await merchant.getByRole('button', { name: '確認收受', exact: true }).click()
  await expect(page.getByTestId('citizen-history')).toContainText('已收受')
  await merchant.getByLabel('今日代收申報量（公升）').fill('99')
  await merchant.getByRole('button', { name: '儲存今日申報' }).click()
  await page.getByRole('button', { name: '市府端', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: '阿明早餐店' })
  await expect(row).toContainText('99.0')
  await row.getByRole('button', { name: '查核詳情' }).click()
  await page.getByLabel('查核備註').fill('已排定清運現場抽查，尚未判定違規。')
  await page.getByRole('button', { name: '儲存查核紀錄' }).click()
  await expect(page.getByRole('status')).toContainText('查核紀錄已儲存')
  await page.reload()
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: '已排定清運現場抽查，尚未判定違規。' }),
  ).toBeVisible()
  expect(errors).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('拒收不計入佐證，暫停收受同步至地圖', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await page.getByRole('button', { name: '載入示範照片' }).click()
  await page
    .getByRole('button', { name: '模擬 AI 體積估算', exact: true })
    .click()
  await page.getByRole('button', { name: '送出交付紀錄' }).click()
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  await page.getByRole('button', { name: '拒收', exact: true }).click()
  await page.getByRole('button', { name: '已拒收', exact: true }).click()
  await expect(page.getByTestId('merchant-records')).toContainText(
    '家戶垃圾或不符收受範圍',
  )
  await expect(page.getByTestId('photo-total')).toContainText('8.4')
  await page.getByLabel('開放收受').uncheck()
  await page.getByRole('button', { name: '儲存收受設定' }).click()
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('暫停收受')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
})

test('照片檔案、估算失效、搜尋與示意地圖選點', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('搜尋店家或街區').fill('惠姐')
  await expect(
    page.getByRole('button', { name: '地圖：阿明早餐店' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '地圖：惠姐雜貨店' }).click()
  await expect(page.getByTestId('selected-store')).toContainText('惠姐雜貨店')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await page.getByLabel('拍照或選取垃圾照片').setInputFiles({
    name: 'waste.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(
    page.getByRole('img', { name: '交付垃圾照片預覽' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '模擬 AI 體積估算', exact: true })
    .click()
  await expect(page.getByRole('button', { name: '送出交付紀錄' })).toBeEnabled()
  await page
    .getByRole('combobox', { name: '垃圾類型', exact: true })
    .selectOption('食物包裝')
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: '模擬 AI 體積估算', exact: true })
    .click()
  await page.getByRole('button', { name: '送出交付紀錄' }).click()
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  await page
    .getByRole('combobox', { name: '選擇合作店家', exact: true })
    .selectOption('b')
  await expect(
    page
      .getByTestId('merchant-records')
      .getByRole('img', { name: '食物包裝交付照片' }),
  ).toBeVisible()
  await page.reload()
  await page
    .getByRole('combobox', { name: '選擇合作店家', exact: true })
    .selectOption('b')
  await expect(
    page
      .getByTestId('merchant-records')
      .getByRole('img', { name: '食物包裝交付照片' }),
  ).toBeVisible()
})

test('清運情境重算、過去日期與未拍照補登', async ({ page }) => {
  await page.goto('/#city')
  await page.getByLabel('當日滿溢通報次數').fill('0')
  await page.getByLabel('每日清運次數').fill('4')
  await page.getByRole('button', { name: '更新模擬情境' }).click()
  await expect(page.getByText('需求與量能比：28%')).toBeVisible()
  await page.getByLabel('分析日期').fill('2026-01-01')
  await expect(
    page.getByRole('row').filter({ hasText: '阿明早餐店' }),
  ).toContainText('尚未申報')
  await expect(page.getByText('需求與量能比：未知')).toBeVisible()
  await page.getByLabel('只看待查核').check()
  await expect(page.getByText('目前沒有待查核異常。')).toBeVisible()
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  await page.getByLabel('未拍照收受量（公升）').fill('3.5')
  await page.getByRole('button', { name: '新增未拍照收受' }).click()
  await expect(page.getByRole('status')).toContainText('已新增未拍照收受')
  await page.getByRole('button', { name: '已收受', exact: true }).click()
  await expect(page.getByTestId('merchant-records')).toContainText(
    '未拍照代收垃圾',
  )
  await expect(page.getByTestId('photo-total')).toContainText('8.4')
  await page.getByLabel('開始收受時間').fill('00:00')
  await page.getByLabel('結束收受時間').fill('00:01')
  await page.getByRole('button', { name: '儲存收受設定' }).click()
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('非開放時段')
  await page.getByLabel('只看收受中').check()
  await expect(
    page.getByRole('button', { name: '地圖：阿明早餐店' }),
  ).toHaveCount(0)
})

test('匯出與重設資料，三端無溢出', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.screenshot({
    path: `docs/screenshots/citizen-${testInfo.project.name}.png`,
    fullPage: true,
  })
  await page.screenshot({
    path: `docs/screenshots/preview-${testInfo.project.name}.png`,
    fullPage: false,
  })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出示範資料 ↓' }).click()
  await expect((await download).suggestedFilename()).toMatch(
    /civil-bin.*\.json$/,
  )
  for (const role of ['店家端', '市府端']) {
    await page.getByRole('button', { name: role, exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `docs/screenshots/${role === '店家端' ? 'merchant' : 'city'}-${testInfo.project.name}.png`,
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
