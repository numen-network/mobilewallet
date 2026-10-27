import { postJson } from '@/network/http'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MoreVertical, ArrowLeft, RefreshCw, Plus, AlertTriangle } from 'lucide-react'
import { NAME_CALL, SYMBOL_CALL, DECIMALS_CALL, readToken, balanceOfCall, readBalance } from '@/evm/erc20'
import type { Token } from '@/chain/types'
import { formatAmount } from '@/lib/balance'
import { TokenLogo } from './TokenLogo'
import { TOKENS } from '@/chain/config'
import { compactTokenBalance } from './TokenBalanceText'

const KEY = 'numen-mobile-custom-tokens-mainnet-v2'
const HIDDEN = 'numen-mobile-hidden-tokens-mainnet-v2'
const RPC = 'https://rpc.numen-network.org'
const ADDRESS = /^0x[a-fA-F0-9]{40}$/
// Display only: raw bigint balances and token decimals remain unchanged for transfers.
function displayTokenBalance(value: bigint, decimals: number): string {
  if (value === 0n) return '0'
  const precision = Math.min(Math.max(decimals, 0), 2)
  const formatted = formatAmount(value, { decimals, precision, pad: false })
  const numeric = Number(formatted.replace(/,/g, ''))
  if (numeric === 0 && value > 0n) return '<0.01'
  const [whole, fraction] = formatted.replace(/,/g, '').split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return compactTokenBalance(fraction ? `${grouped}.${fraction}` : grouped)
}

const load = <T,>(key: string, fallback: T): T => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback } catch { return fallback } }
async function call(to: string, data: string): Promise<string> {
  const result = await postJson<{ result?: string; error?: { message?: string } }>(RPC, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  if (result.error || !result.result || result.result === '0x') throw new Error(result.error?.message || 'Not a valid ERC-20 contract')
  return result.result
}
function normalize(tokens: Token[]): Token[] { return [...new Map(tokens.map(token => [token.address.toLowerCase(), {...token, address: token.address.toLowerCase()}])).values()] }
export function MobileTokenManager({ accountAddress, evmAddress, nativeBalance, hideBalances = false, refreshNonce, onRefreshStateChange }: { accountAddress: string; evmAddress?: string | null; nativeBalance: string; hideBalances?: boolean; refreshNonce: number; onRefreshStateChange?: (loading: boolean) => void }) {
  // Custom tokens belong to the selected wallet, not every wallet on the device.
  const accountKey = `${KEY}:${accountAddress.toLowerCase()}`
  const hiddenKey = `${HIDDEN}:${accountAddress.toLowerCase()}`
  const [custom, setCustom] = useState<Token[]>(() => load<Token[]>(accountKey, []))
  const [hidden, setHidden] = useState<string[]>(() => load<string[]>(hiddenKey, []))
  const [page, setPage] = useState<'assets' | 'manage' | 'add'>('assets')
  const [menu, setMenu] = useState(false)
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [known, setKnown] = useState<Token[]>([])
  // Known contracts are independent of their artwork. A logo never creates a token.
  const tokens = useMemo(() => normalize([...known, ...custom]), [known, custom])
  useEffect(() => {
    let cancelled = false
    const discover = async () => {
      const entries = await Promise.all((TOKENS[32026] ?? []).map(async ({ address, icon }) => {
        try {
          const [name, symbol, decimals] = await Promise.all([call(address, NAME_CALL), call(address, SYMBOL_CALL), call(address, DECIMALS_CALL)])
          return { ...readToken(address.toLowerCase(), { name, symbol, decimals }), icon } as Token
        } catch { return null }
      }))
      if (!cancelled) setKnown(entries.filter((token): token is Token => token !== null))
    }
    void discover()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    setCustom(load<Token[]>(accountKey, []))
    setHidden(load<string[]>(hiddenKey, []))
    setBalances({})
    setPage('assets')
    setMenu(false)
  }, [accountKey, hiddenKey])
  const refresh = useCallback(async (showProgress = false) => {
    if (showProgress) { setRefreshing(true); onRefreshStateChange?.(true) }
    try {
      if (!evmAddress || !ADDRESS.test(evmAddress)) { setBalances({}); return }
      const next: Record<string, bigint> = {}
      await Promise.all(tokens.map(async token => {
        try { next[token.address] = readBalance(await call(token.address, balanceOfCall(evmAddress))) }
        catch { /* RPC errors must not create fake balances */ }
      }))
      setBalances(next)
    } finally {
      if (showProgress) { setRefreshing(false); onRefreshStateChange?.(false) }
    }
  }, [evmAddress, tokens, onRefreshStateChange])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (refreshNonce > 0) void refresh(true) }, [refreshNonce])
  const toggle = (token: Token) => { const next = hidden.includes(token.address) ? hidden.filter(a => a !== token.address) : [...hidden, token.address]; setHidden(next); localStorage.setItem(hiddenKey, JSON.stringify(next)) }
  const add = async () => {
    setError('')
    const contract = address.trim().toLowerCase()
    if (!ADDRESS.test(contract)) { setError('Enter a valid 0x contract address'); return }
    if (tokens.some(token => token.address === contract)) { setError('Token already added'); return }
    setBusy(true)
    try {
      const [name, symbol, decimals] = await Promise.all([call(contract, NAME_CALL), call(contract, SYMBOL_CALL), call(contract, DECIMALS_CALL)])
      const token: Token = {...readToken(contract, {name, symbol, decimals}), icon: ''}
      if (!token.name || !token.symbol || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) throw new Error('Invalid token metadata')
      const next = [...custom, token]
      setCustom(next); localStorage.setItem(accountKey, JSON.stringify(next))
      setAddress(''); setPage('manage')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read token contract') }
    finally { setBusy(false) }
  }
  return <section className="mx-auto mt-7 max-w-md rounded-2xl border border-border bg-card p-4 shadow-sm">
    {page === 'assets' ? <>
      <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Assets</h2><div className="relative"><button type="button" aria-label="Token options" onClick={() => setMenu(!menu)} className="rounded-lg p-2 hover:bg-muted"><MoreVertical className="size-5" /></button>{menu && <div className="absolute right-0 top-full z-20 w-44 rounded-xl border bg-card p-1 shadow-lg"><button type="button" className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => {setPage('manage');setMenu(false)}}>Manage Tokens</button></div>}</div></div>
      {refreshing && <p role="status" aria-live="polite" className="mb-3 flex items-center gap-2 text-xs text-primary"><RefreshCw className="size-3.5 animate-spin" />Updating assets...</p>}
      <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-4"><TokenLogo symbol="NUMN" /><span className="flex-1 font-semibold">NUMN</span><span className="font-mono text-sm font-semibold">{nativeBalance}</span></div>
      {tokens.filter(token => !!evmAddress && !hidden.includes(token.address) && (balances[token.address] !== undefined && (balances[token.address] > 0n || known.some(entry => entry.address === token.address)))).map(token => <div key={token.address} className="mt-2 flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm"><div className="flex min-w-0 flex-1 items-center gap-3"><TokenLogo symbol={token.symbol} /><div className="min-w-0"><p className="font-semibold">{token.symbol}</p><p className="truncate text-xs text-muted-foreground">{token.name}</p></div></div><span className="max-w-[46%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-xs tabular-nums" title={hideBalances ? "Balance hidden" : formatAmount(balances[token.address]!, {decimals: token.decimals, precision: token.decimals})}>{hideBalances ? "••••" : displayTokenBalance(balances[token.address]!, token.decimals)}</span></div>)}
    </> : page === 'manage' ? <>
      <div className="mb-5 flex items-center gap-3"><button type="button" aria-label="Back to assets" onClick={() => setPage('assets')}><ArrowLeft className="size-5"/></button><h2 className="font-bold">Manage Tokens</h2></div>
      <p className="mb-3 text-xs text-muted-foreground">Network: Numen Network</p>
      {tokens.map(token => <div key={token.address} className="flex items-center justify-between gap-3 border-b py-3"><div className="min-w-0"><p className="text-sm font-semibold">{token.symbol}</p><p className="truncate text-xs text-muted-foreground">{token.name}</p></div><button type="button" role="switch" aria-checked={!hidden.includes(token.address)} aria-label={`Show ${token.symbol}`} onClick={() => toggle(token)} className={`h-7 w-12 rounded-full p-1 transition ${hidden.includes(token.address) ? 'bg-muted-foreground/30' : 'bg-primary'}`}><span className={`block size-5 rounded-full bg-white transition-transform ${hidden.includes(token.address) ? '' : 'translate-x-5'}`}/></button></div>)}
      <button type="button" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm font-semibold" onClick={() => {setError('');setPage('add')}}><Plus className="size-4"/>Add Custom Token</button>
    </> : <>
      <div className="mb-5 flex items-center gap-3"><button type="button" aria-label="Back to token manager" onClick={() => setPage('manage')}><ArrowLeft className="size-5"/></button><h2 className="font-bold">Add Custom Token</h2></div>
      <div className="mb-6 flex gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-5 shrink-0"/><span>Anyone can create a token, including fake versions of legitimate tokens. Verify the contract address before adding it.</span></div>
      <p className="mb-2 text-sm font-medium">Network</p><p className="mb-5 rounded-xl bg-muted p-3 text-sm">Numen Network</p>
      <label className="mb-2 block text-sm font-medium" htmlFor="token-contract">Token Contract Address</label><input id="token-contract" className="w-full rounded-xl border bg-background p-3 font-mono text-sm" placeholder="0x..." value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <button type="button" disabled={busy || !ADDRESS.test(address.trim())} onClick={() => void add()} className="mt-6 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-40">{busy ? 'Reading contract...' : 'Add Token'}</button>
    </>}
  </section>
}
