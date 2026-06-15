const LEFT_ODD_PATTERNS = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]

const LEFT_EVEN_PATTERNS = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
]

const RIGHT_PATTERNS = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
]

const LEFT_PARITY_BY_FIRST_DIGIT = [
  'OOOOOO',
  'OOEOEE',
  'OOEEOE',
  'OOEEEO',
  'OEOOEE',
  'OEEOOE',
  'OEEEOO',
  'OEOEOE',
  'OEOEEO',
  'OEEOEO',
]

function onlyDigits(value: string): string {
  return String(value || '').replace(/\D/g, '')
}

export function computeEan13CheckDigit(payload12: string): number {
  const digits = onlyDigits(payload12)
  if (digits.length !== 12) {
    throw new Error('EAN-13 payload must be 12 digits')
  }

  let oddSum = 0
  let evenSum = 0
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(digits[i] || '0')
    if ((i + 1) % 2 === 0) evenSum += digit
    else oddSum += digit
  }
  return (10 - ((oddSum + evenSum * 3) % 10)) % 10
}

export function createEan13FromPayload(payload12: string): string {
  const digits = onlyDigits(payload12)
  if (digits.length !== 12) {
    throw new Error('EAN-13 payload must be 12 digits')
  }
  const checkDigit = computeEan13CheckDigit(digits)
  return `${digits}${checkDigit}`
}

export function createEan13FromPrefix(prefix: string, serial: number, serialDigits: number): string {
  const normalizedPrefix = onlyDigits(prefix)
  if (!normalizedPrefix) throw new Error('EAN prefix is required')
  if (!Number.isInteger(serial) || serial < 0) throw new Error('EAN serial must be a non-negative integer')
  if (!Number.isInteger(serialDigits) || serialDigits <= 0) throw new Error('EAN serial digits must be positive')

  const payloadLength = 12
  if (normalizedPrefix.length + serialDigits !== payloadLength) {
    throw new Error('EAN prefix length + serialDigits must equal 12')
  }

  const maxSerial = 10 ** serialDigits - 1
  if (serial > maxSerial) throw new Error('EAN serial exceeded capacity')

  const payload = `${normalizedPrefix}${String(serial).padStart(serialDigits, '0')}`
  return createEan13FromPayload(payload)
}

export function isValidEan13(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 13) return false
  try {
    const checkDigit = computeEan13CheckDigit(digits.slice(0, 12))
    return checkDigit === Number(digits[12] || '0')
  } catch {
    return false
  }
}

function encodeEan13Bits(code: string): string {
  const digits = onlyDigits(code)
  if (!isValidEan13(digits)) {
    throw new Error('Invalid EAN-13 code')
  }

  const first = Number(digits[0] || '0')
  const parity = LEFT_PARITY_BY_FIRST_DIGIT[first]
  if (!parity) throw new Error('Unsupported EAN-13 first digit')

  const leftBits = digits
    .slice(1, 7)
    .split('')
    .map((char, index) => {
      const digit = Number(char || '0')
      return parity[index] === 'E' ? LEFT_EVEN_PATTERNS[digit] : LEFT_ODD_PATTERNS[digit]
    })
    .join('')

  const rightBits = digits
    .slice(7)
    .split('')
    .map((char) => RIGHT_PATTERNS[Number(char || '0')])
    .join('')

  return `101${leftBits}01010${rightBits}101`
}

interface EanRenderOptions {
  width: number
  height: number
  includeText?: boolean
  fontSize?: number
  barColor?: string
  backgroundColor?: string
  quietZoneModules?: number
  guardExtension?: number
}

export function renderEan13Svg(code: string, options: EanRenderOptions): string {
  const bits = encodeEan13Bits(code)
  const width = Math.max(1, Math.round(options.width))
  const height = Math.max(1, Math.round(options.height))
  const includeText = options.includeText !== false
  const fontSize = Math.max(8, Math.round(options.fontSize ?? 12))
  const quietModules = Math.max(2, Math.round(options.quietZoneModules ?? 4))
  const guardExtension = includeText ? Math.max(0, Math.round(options.guardExtension ?? 6)) : 0
  const barColor = options.barColor || '#111111'
  const backgroundColor = options.backgroundColor || '#ffffff'

  const totalModules = 95 + quietModules * 2
  const moduleWidth = width / totalModules
  const textAreaHeight = includeText ? fontSize + 6 : 0
  const barHeight = Math.max(20, height - textAreaHeight)
  const guardIndexSet = new Set<number>([
    0, 1, 2,
    45, 46, 47, 48, 49,
    92, 93, 94,
  ])

  let bars = ''
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] !== '1') continue
    const x = (quietModules + i) * moduleWidth
    const isGuard = guardIndexSet.has(i)
    const currentHeight = isGuard ? barHeight + guardExtension : barHeight
    bars += `<rect x="${x.toFixed(3)}" y="0" width="${moduleWidth.toFixed(3)}" height="${currentHeight.toFixed(3)}" fill="${barColor}"/>`
  }

  const textMarkup = includeText
    ? `<text x="${(width / 2).toFixed(2)}" y="${(barHeight + fontSize + 2).toFixed(2)}" text-anchor="middle" fill="${barColor}" font-size="${fontSize}" font-family="Arial, sans-serif" letter-spacing="1">${code}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${code}"><rect width="${width}" height="${height}" fill="${backgroundColor}"/>${bars}${textMarkup}</svg>`
}
