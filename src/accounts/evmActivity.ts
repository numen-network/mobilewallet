import type { Network } from '@/chain/config'
import type { Account } from './types'

export interface EvmActivity {
  hash: string
  logIndex: string
  from: string
  to: string
  amount: string
  symbol: string
  direction: string
  status: string
}

type Saved = EvmActivity & { networkId: string }
const KEY = 'numen-wallet-evm-outgoing-v1'
const readSaved = (): Saved[] => {
  try { const data: unknown = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(data) ? data as Saved[] : [] }
  catch { return [] }
}
export function rememberEvmSend(entry: { hash: string; from: string; to: string; amount: string; symbol: string; networkId: string }) {
  const old = readSaved().filter((item) => item.hash !== entry.hash)
  try { localStorage.setItem(KEY, JSON.stringify([{ ...entry, logIndex: 'local', direction: 'Sent', status: 'Submitted' }, ...old].slice(0, 100))) } catch { /* Storage may be unavailable */ }
}
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const topicAddress = (address: string) => '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
const fromTopic = (topic: string) => '0x' + topic.slice(-40)
function humanAmount(raw: string, decimals: number) {
  const amount = BigInt(raw)
  const unit = 10n ** BigInt(decimals)
  const whole = amount / unit
  const fraction = (amount % unit).toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6)
  return `${whole}${fraction ? '.' + fraction : ''}`
}

export async function readEvmActivity(accounts: Account[], network: Network): Promise<EvmActivity[]> {
  const addresses = [...new Set(accounts.map((a) => a.evmAddress?.toLowerCase()).filter((v): v is string => !!v))]
  const saved = readSaved().filter((item) => item.networkId === network.id && addresses.includes(item.from.toLowerCase()))
  if (!addresses.length) return saved
  const endpoint = network.rpc.replace(/^ws/, 'http')
  let id = 0
  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
    if (!response.ok) throw new Error(`RPC ${response.status}`)
    const result = await response.json() as { result?: unknown; error?: { message?: string } }
    if (result.error) throw new Error(result.error.message || 'RPC error')
    return result.result
  }
  // RPC log ranges are deliberately bounded. This is recent ERC-20 activity,
  // not a claim to index the entire chain or native NUMN transfers.
  const latest = BigInt(String(await rpc('eth_blockNumber', [])))
  const fromBlock = '0x' + (latest > 1200n ? latest - 1200n : 0n).toString(16)
  type Log = { transactionHash: string; logIndex: string; topics: string[]; data: string; address: string; removed?: boolean }
  const batches = await Promise.all(addresses.flatMap((address) => [
    rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [transferTopic, topicAddress(address)] }]),
    rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [transferTopic, null, topicAddress(address)] }]),
  ]))
  const logs = [...new Map(batches.flatMap((batch) => Array.isArray(batch) ? batch as Log[] : []).filter((log) => !log.removed && log.topics?.length === 3).map((log) => [`${log.transactionHash}-${log.logIndex}`, log])).values()].slice(-100)
  const contracts = [...new Set(logs.map((log) => log.address.toLowerCase()))]
  const metadata = new Map<string, { decimals: number; symbol: string }>()
  await Promise.all(contracts.map(async (address) => {
    let decimals = 18
    let symbol = 'ERC-20'
    try { const raw = String(await rpc('eth_call', [{ to: address, data: '0x313ce567' }, 'latest'])); const n = Number(BigInt(raw)); if (Number.isInteger(n) && n >= 0 && n <= 36) decimals = n } catch { /* contract metadata optional */ }
    try {
      const raw = String(await rpc('eth_call', [{ to: address, data: '0x95d89b41' }, 'latest']))
      const hex = raw.replace(/^0x/, '')
      if (hex.length >= 128) {
        const length = Number(BigInt('0x' + hex.slice(64, 128)))
        if (length > 0 && length <= 40) { const bytes = hex.slice(128, 128 + length * 2).match(/.{2}/g) || []; const value = new TextDecoder().decode(Uint8Array.from(bytes.map((x) => parseInt(x, 16)))); if (value.trim()) symbol = value.trim() }
      }
    } catch { /* contract metadata optional */ }
    metadata.set(address, { decimals, symbol })
  }))
  const entries: EvmActivity[] = logs.map((log) => {
    const from = fromTopic(log.topics[1])
    const to = fromTopic(log.topics[2])
    const info = metadata.get(log.address.toLowerCase()) || { decimals: 18, symbol: 'ERC-20' }
    return { hash: log.transactionHash, logIndex: log.logIndex, from, to, amount: humanAmount(log.data, info.decimals), symbol: info.symbol, direction: addresses.includes(to.toLowerCase()) ? 'Received' : 'Sent', status: 'On-chain' }
  })
  const seen = new Set(entries.map((item) => item.hash.toLowerCase()))
  return [...saved.filter((item) => !seen.has(item.hash.toLowerCase())), ...entries].reverse()
}
