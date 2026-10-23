import { test, expect } from '@playwright/test'

test('未修改原版 HTML 可透過 HTTP 完成三端流程', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/originals/street_corner_partner_prototype_v2.html')
  await page.getByRole('button', { name: '載入示範照片', exact: true }).click()
  await page
    .getByRole('button', { name: '✨ 模擬 AI 辨識與體積估算', exact: true })
    .click()
  await page
    .getByRole('button', { name: '送出紀錄，請店家確認 →', exact: true })
    .click()
  await page.getByRole('link', { name: '🏪 店家端' }).click()
  await page.getByRole('button', { name: '✓ 接受', exact: true }).click()
  await expect(page.locator('#merchantPhotoLiters')).toHaveText('10.0')
  await page.getByRole('link', { name: '📊 市府端' }).click()
  await expect(page.locator('#cityPhotos')).toHaveText('13')
  await expect(page.locator('#cityLiters')).toHaveText('20.8')
  expect(errors).toEqual([])
})
