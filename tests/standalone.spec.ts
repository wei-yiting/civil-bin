import { test, expect } from '@playwright/test'

test('單檔 HTML 不需其他網路資源即可完成交付', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00+08:00'))
  await page.goto('http://127.0.0.1:4175/standalone.html')
  await expect(
    page.getByRole('heading', { name: '附近哪裡可以丟垃圾？' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '載入示範照片', exact: true }).click()
  await page
    .getByRole('button', { name: '模擬 AI 體積估算', exact: true })
    .click()
  await page.getByRole('button', { name: '送出交付紀錄' }).click()
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  await expect(
    page.getByTestId('merchant-records').getByRole('img'),
  ).toBeVisible()
  await page.getByRole('button', { name: '確認收受', exact: true }).click()
  await page.getByRole('button', { name: '市府端', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '阿明早餐店' }),
  ).toContainText('10.0')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '公共垃圾需求與收受分析' }),
  ).toBeVisible()
  expect(errors).toEqual([])
  expect(requests.filter((url) => !url.startsWith('data:'))).toEqual([
    'http://127.0.0.1:4175/standalone.html',
    'http://127.0.0.1:4175/standalone.html',
  ])
})
