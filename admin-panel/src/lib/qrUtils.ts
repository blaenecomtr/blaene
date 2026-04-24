import QRCode from 'qrcode'

export type QrStyle = 'standard' | 'rounded' | 'dots' | 'square' | 'logo' | 'color'

type QRData = ReturnType<typeof QRCode.create>

function getModuleData(value: string, ec: 'L' | 'M' | 'Q' | 'H'): QRData | null {
  try {
    return QRCode.create(value, { errorCorrectionLevel: ec })
  } catch {
    return null
  }
}

function svgWrap(sizePx: number, inner: string, bg = '#ffffff'): string {
  return (
    `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;">` +
    `<rect width="${sizePx}" height="${sizePx}" fill="${bg}"/>` +
    inner +
    `</svg>`
  )
}

function isInFinder(row: number, col: number, mc: number): boolean {
  return (row < 7 && col < 7) || (row < 7 && col >= mc - 7) || (row >= mc - 7 && col < 7)
}

function buildRoundedFinders(mc: number, ms: number, fg: string, bg: string): string {
  let out = ''
  const fs = 7 * ms
  const ip = ms; const iw = 5 * ms; const ib = 3 * ms
  for (const [fr, fc] of [[0, 0], [0, mc - 7], [mc - 7, 0]] as [number, number][]) {
    const x = fc * ms; const y = fr * ms
    out += `<rect x="${x}" y="${y}" width="${fs}" height="${fs}" fill="${fg}" rx="${ms * 0.8}"/>`
    out += `<rect x="${x + ip}" y="${y + ip}" width="${iw}" height="${iw}" fill="${bg}" rx="${ms * 0.5}"/>`
    out += `<rect x="${x + ip * 2}" y="${y + ip * 2}" width="${ib}" height="${ib}" fill="${fg}" rx="${ms * 0.3}"/>`
  }
  return out
}

function buildSquareFinders(mc: number, ms: number, fg: string, bg: string): string {
  let out = ''
  const fs = 7 * ms
  const ip = ms; const iw = 5 * ms; const ib = 3 * ms
  for (const [fr, fc] of [[0, 0], [0, mc - 7], [mc - 7, 0]] as [number, number][]) {
    const x = fc * ms; const y = fr * ms
    out += `<rect x="${x}" y="${y}" width="${fs}" height="${fs}" fill="${fg}"/>`
    out += `<rect x="${x + ip}" y="${y + ip}" width="${iw}" height="${iw}" fill="${bg}"/>`
    out += `<rect x="${x + ip * 2}" y="${y + ip * 2}" width="${ib}" height="${ib}" fill="${fg}"/>`
  }
  return out
}

function buildCircleDots(qd: QRData, mc: number, ms: number, fg: string, r: number): string {
  let out = ''
  for (let row = 0; row < mc; row++)
    for (let col = 0; col < mc; col++)
      if (qd.modules.get(row, col) && !isInFinder(row, col, mc))
        out += `<circle cx="${(col + 0.5) * ms}" cy="${(row + 0.5) * ms}" r="${r}" fill="${fg}"/>`
  return out
}

function buildRectDots(qd: QRData, mc: number, ms: number, fg: string): string {
  let out = ''
  const pad = ms * 0.05
  for (let row = 0; row < mc; row++)
    for (let col = 0; col < mc; col++)
      if (qd.modules.get(row, col) && !isInFinder(row, col, mc))
        out += `<rect x="${col * ms + pad}" y="${row * ms + pad}" width="${ms - pad * 2}" height="${ms - pad * 2}" fill="${fg}"/>`
  return out
}

function buildStandardQr(value: string, sizePx: number): string {
  const qd = getModuleData(value, 'M')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const bg = '#ffffff'
  let inner = buildSquareFinders(mc, ms, fg, bg)
  inner += buildRectDots(qd, mc, ms, fg)
  return svgWrap(sizePx, inner, bg)
}

function buildRoundedQr(value: string, sizePx: number): string {
  const qd = getModuleData(value, 'M')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const bg = '#ffffff'
  let inner = buildRoundedFinders(mc, ms, fg, bg)
  inner += buildCircleDots(qd, mc, ms, fg, ms * 0.45)
  return svgWrap(sizePx, inner, bg)
}

function buildDotsQr(value: string, sizePx: number): string {
  const qd = getModuleData(value, 'M')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const bg = '#ffffff'
  // Finder'lar tamamen dairevi
  let inner = ''
  const outerR = 3.5 * ms   // 7x7 modül → yarıçap 3.5
  const midR = 2.5 * ms     // 5x5 boşluk → yarıçap 2.5
  const innerR = 1.5 * ms   // 3x3 iç kare → yarıçap 1.5
  for (const [fr, fc] of [[0, 0], [0, mc - 7], [mc - 7, 0]] as [number, number][]) {
    const cx = (fc + 3.5) * ms; const cy = (fr + 3.5) * ms
    inner += `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${fg}"/>`
    inner += `<circle cx="${cx}" cy="${cy}" r="${midR}" fill="${bg}"/>`
    inner += `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${fg}"/>`
  }
  inner += buildCircleDots(qd, mc, ms, fg, ms * 0.5)
  return svgWrap(sizePx, inner, bg)
}

function buildSquareQr(value: string, sizePx: number): string {
  const qd = getModuleData(value, 'M')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const bg = '#ffffff'
  let inner = buildSquareFinders(mc, ms, fg, bg)
  inner += buildRectDots(qd, mc, ms, fg)
  return svgWrap(sizePx, inner, bg)
}

function buildLogoQr(value: string, sizePx: number, logoBase64: string): string {
  const qd = getModuleData(value, 'H')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const bg = '#ffffff'
  let inner = buildRoundedFinders(mc, ms, fg, bg)
  inner += buildCircleDots(qd, mc, ms, fg, ms * 0.45)
  if (logoBase64) {
    const logoSize = Math.round(sizePx * 0.22)
    const logoPad = Math.round(sizePx * 0.015)
    const logoOuter = logoSize + logoPad * 2
    const logoX = (sizePx - logoOuter) / 2
    const logoY = (sizePx - logoOuter) / 2
    inner += `<rect x="${logoX}" y="${logoY}" width="${logoOuter}" height="${logoOuter}" fill="${bg}" rx="4"/>`
    inner += `<image x="${logoX + logoPad}" y="${logoY + logoPad}" width="${logoSize}" height="${logoSize}" href="${logoBase64}" preserveAspectRatio="xMidYMid meet"/>`
  }
  return svgWrap(sizePx, inner, bg)
}

function buildColorQr(value: string, sizePx: number): string {
  const qd = getModuleData(value, 'M')
  if (!qd) return ''
  const mc = qd.modules.size
  const ms = sizePx / mc
  const fg = '#000000'
  const dotFg = '#1a3c6e'
  const bg = '#ffffff'
  let inner = buildRoundedFinders(mc, ms, fg, bg)
  inner += buildCircleDots(qd, mc, ms, dotFg, ms * 0.45)
  return svgWrap(sizePx, inner, bg)
}

export function buildQrSvg(
  value: string,
  sizePx: number,
  style: QrStyle = 'rounded',
  logoBase64?: string,
): string {
  try {
    switch (style) {
      case 'standard': return buildStandardQr(value, sizePx)
      case 'rounded':  return buildRoundedQr(value, sizePx)
      case 'dots':     return buildDotsQr(value, sizePx)
      case 'square':   return buildSquareQr(value, sizePx)
      case 'logo':     return buildLogoQr(value, sizePx, logoBase64 ?? '')
      case 'color':    return buildColorQr(value, sizePx)
      default:         return buildRoundedQr(value, sizePx)
    }
  } catch {
    return ''
  }
}
