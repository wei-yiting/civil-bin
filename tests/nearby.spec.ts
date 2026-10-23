import { test, expect } from '@playwright/test'
import { mockMapNetwork } from './mockMapNetwork'

test('公共桶與開放店家混排，今日紀錄在遠處與停收清單之前', async ({
  page,
  context,
}) => {
  await mockMapNetwork(context)
  await page.clock.install({ time: new Date('2026-10-24T10:00:00+08:00') })
  await page.goto('/')
  const nearby = page.getByRole('region', {
    name: '1 公里內的附近據點',
    exact: true,
  })
  await expect(nearby).toContainText('阿明早餐店')
  await expect(nearby).toContainText('官方位置')
  await expect(nearby).not.toContainText('非開放時段')
  const history = page.getByTestId('citizen-history')
  await expect(history).toContainText(
    '完成交付後，可以在這裡查看店家確認結果。',
  )
  await expect(
    history.getByRole('heading', { name: '我今天的交付紀錄' }),
  ).toBeVisible()
  const other = page.getByRole('group', { name: '其他據點', exact: true })
  const a = await nearby.boundingBox(),
    b = await history.boundingBox(),
    c = await other.boundingBox()
  expect(a!.y).toBeLessThan(b!.y)
  expect(b!.y).toBeLessThan(c!.y)
  const more = nearby.getByRole('button', { name: /顯示更多附近據點/ })
  const before = await nearby.getByRole('button').count()
  await more.click()
  await expect
    .poll(() => nearby.getByRole('button').count())
    .toBeGreaterThan(before)
  await page.getByRole('button', { name: '店家端', exact: true }).click()
  await page.getByRole('button', { name: '今天停止收受', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('今日已停止收受')
  await page.getByRole('button', { name: '民眾端', exact: true }).click()
  await expect(
    nearby.getByRole('button').filter({ hasText: '阿明早餐店' }),
  ).toHaveCount(0)
  await other.getByText(/其他據點（1 公里外／暫未收受）/).click()
  await expect(
    other.getByRole('button').filter({ hasText: '阿明早餐店' }),
  ).toBeVisible()
  await expect(
    other.getByRole('button').filter({ hasText: '阿明早餐店' }),
  ).toContainText('今日已停收')
})
