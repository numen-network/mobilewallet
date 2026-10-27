import { useEffect, useMemo, useState } from 'react'
import numenLogo from '@/assets/numen-logo.png'
import wtmrLogo from '@/assets/tokens/wtmr.svg'

const PALETTE = [
  ['#dbeafe', '#1d4ed8'], ['#fee2e2', '#b91c1c'],
  ['#dcfce7', '#15803d'], ['#f3e8ff', '#7e22ce'],
  ['#ffedd5', '#c2410c'], ['#ccfbf1', '#0f766e'],
  ['#fce7f3', '#be185d'], ['#e0e7ff', '#4338ca'],
] as const

const EXPLORER_ASSETS = 'https://raw.githubusercontent.com/numen-network/explorer/master/web/src/assets'

/** Try token-specific artwork first, then wrapped-token artwork, then the Explorer's root assets. */
function logoCandidates(symbol: string): string[] {
  const name = symbol.trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return []
  const variants = [name]
  // A wrapped symbol such as wWTMR may reuse the underlying WTMR logo.
  if (name.startsWith('w') && name.length > 1) variants.push(name.slice(1))
  const urls: string[] = []
  for (const variant of variants) {
    if (variant === 'wtmr') urls.push(wtmrLogo)
    urls.push(`${EXPLORER_ASSETS}/tokens/${variant}.svg`)
    urls.push(`${EXPLORER_ASSETS}/${variant}.svg`)
  }
  return [...new Set(urls)]
}

export function TokenLogo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const normalized = symbol.trim().toUpperCase()
  const candidates = useMemo(() => normalized === 'NUMN' ? [numenLogo] : logoCandidates(normalized), [normalized])
  const [candidateIndex, setCandidateIndex] = useState(0)
  useEffect(() => setCandidateIndex(0), [normalized])
  const colors = useMemo(() => {
    let hash = 0
    for (const char of normalized) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
    return PALETTE[hash % PALETTE.length]
  }, [normalized])
  const logoUrl = candidates[candidateIndex]
  return <span aria-label={`${normalized} token logo`} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold" style={{ width: size, height: size, backgroundColor: colors[0], color: colors[1], fontSize: size * 0.48 }}>
    {logoUrl ? <img key={logoUrl} src={logoUrl} alt="" width={size} height={size} className="h-full w-full object-contain" loading="lazy" onError={() => setCandidateIndex(index => index + 1)} /> : (normalized[0] || '?')}
  </span>
}
