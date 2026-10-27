import { describe, expect, it } from 'vitest'
import { normalizeEvmChainId } from './metamask'

describe('MetaMask chain ID normalization', () => {
  it('accepts numeric, decimal, and hex Numen chain IDs', () => {
    for (const id of [32026, 32026n, '32026', '0x7d1a', '0X7D1A']) {
      expect(normalizeEvmChainId(id)).toBe('0x7d1a')
    }
  })
  it('rejects invalid types', () => {
    expect(() => normalizeEvmChainId({ chainId: 32026 })).toThrow()
  })
})
