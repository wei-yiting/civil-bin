import { test, expect } from '@playwright/test'
import { mockMapNetwork } from './mockMapNetwork'

const saturday = new Date('2026-10-24T10:00:00+08:00')
test.beforeEach(async ({ context, page }) => {
  await mockMapNetwork(context)
  await page.clock.install({ time: saturday })
})

test('24 家示範店與每週休息日跨角色保存', async ({ page }) => {
  await page.goto('/#merchant')
  await expect(
    page
      .getByRole('combobox', { name: '選擇合作店家', exact: true })
      .getByRole('option'),
  ).toHaveCount(24)
  await page.getByRole('checkbox', { name: '週六收受', exact: true }).uncheck()
  await page.getByRole('button', { name: '儲存收受設定', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('收受設定已儲存')
  await page.reload()
  await expect(
    page.getByRole('checkbox', { name: '週六收受', exact: true }),
  ).not.toBeChecked()
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(page.getByTestId('selected-store')).toContainText('今日休息')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
})

test('今日停收即時同步另一分頁，解除不修改週時段，換日恢復', async ({
  page,
  context,
}) => {
  await page.goto('/')
  const merchant = await context.newPage()
  await merchant.clock.install({ time: saturday })
  await merchant.goto('/#merchant')
  await merchant
    .getByRole('textbox', { name: '今日停收原因', exact: true })
    .fill('空間已滿，今天提前結束')
  await merchant
    .getByRole('button', { name: '今天停止收受', exact: true })
    .click()
  await expect(page.getByTestId('selected-store')).toContainText('今日已停收')
  await expect(page.getByTestId('selected-store')).toContainText('空間已滿')
  await page.getByRole('button', { name: '拍照交付', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '送出交付紀錄' }),
  ).toBeDisabled()
  await merchant
    .getByRole('button', { name: '解除今日停收', exact: true })
    .click()
  await expect(page.getByTestId('selected-store')).toContainText('收受中')
  await expect(
    merchant.getByLabel('週六開始時間', { exact: true }),
  ).toHaveValue('00:00')
  await merchant
    .getByRole('button', { name: '今天停止收受', exact: true })
    .click()
  await page.clock.setSystemTime(new Date('2026-10-25T10:00:00+08:00'))
  await page.reload()
  await expect(page.getByTestId('selected-store')).toContainText('收受中')
})
