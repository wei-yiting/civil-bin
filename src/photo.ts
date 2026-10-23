export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('請選擇 JPEG、PNG 或 WebP 照片；HEIC 請先轉成 JPEG。')
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('照片超過 8 MB，請先縮小。')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 900 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('此瀏覽器無法處理照片，請改用示範照片。')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    throw new Error('無法讀取照片，請改選有效的 JPEG、PNG 或 WebP。')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const SAMPLE =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#e4eee6"/><ellipse cx="300" cy="250" rx="200" ry="20" fill="#c5d8ca"/><path d="M110 100h95l-15 140h-65z" fill="#fff" stroke="#246656" stroke-width="4"/><path d="M115 100h85M165 60l10 80" stroke="#246656" stroke-width="7"/><rect x="260" y="145" width="170" height="100" rx="10" fill="#e0bc84"/><path d="M260 185h170" stroke="#af8c55" stroke-width="3"/><rect x="465" y="140" width="65" height="100" rx="4" fill="#fff" stroke="#246656" stroke-width="3"/><path d="M475 160h45M475 175h30M475 190h45" stroke="#246656" stroke-width="3"/></svg>`,
  )
