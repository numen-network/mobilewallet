/** Compact display only; transaction amounts always use the original bigint. */
export function compactTokenBalance(formatted: string): string {
  const clean = formatted.replace(/,/g, '').trim()
  const match = clean.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return formatted
  const [, sign, integer, fraction = ''] = match
  const groups: [number, string][] = [[12, 'T'], [9, 'B'], [6, 'M'], [3, 'K']]
  for (const [digits, suffix] of groups) {
    if (integer.length > digits) {
      const whole = integer.slice(0, -digits)
      const decimal = (integer.slice(-digits) + fraction).slice(0, whole.length >= 3 ? 0 : 2).replace(/0+$/, '')
      return `${sign}${whole}${decimal ? '.' + decimal : ''}${suffix}`
    }
  }
  return formatted
}
