import { u8aToHex } from '@polkadot/util'
import { keccakAsU8a } from '@polkadot/util-crypto'
import type { Network } from '@/chain/config'
import type { ChainFacts } from '@/chain/types'
import { transferCall } from './erc20'
import { Capacitor } from '@capacitor/core'
import { connectMobileMetaMask, connectedMobileMetaMaskProvider, mobileMetaMaskProvider, openMetaMaskForApproval } from './mobileWalletConnect'

/**
 * Numen runs an EVM alongside the substrate side, and MetaMask is where people
 * already keep their EVM habits. Rather than growing a second signing stack the
 * wallet just hands MetaMask the network, and the two split the work.
 */

export interface EvmChainParams {
  chainId: string
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls: string[]
}

// MetaMask speaks HTTP, which a substrate node serves on the socket's own port
const httpRpc = (network: Network) => network.rpc.replace(/^ws/, 'http')

export function evmChainParams(network: Network, facts: ChainFacts): EvmChainParams {
  return {
    // MetaMask reads this as hex and silently mismatches a decimal one
    chainId: `0x${facts.evmChainId.toString(16)}`,
    chainName: network.name,
    nativeCurrency: { name: network.name, symbol: facts.symbol, decimals: facts.decimals },
    rpcUrls: [httpRpc(network)],
    blockExplorerUrls: [network.explorer],
  }
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export function metaMask(): EthereumProvider | null {
  return Capacitor.isNativePlatform()
    ? (mobileMetaMaskProvider() as EthereumProvider | null)
    : ((globalThis as { ethereum?: EthereumProvider }).ethereum ?? null)
}

/** MetaMask's code for a user who clicked away the prompt. Not a failure. */
export const USER_REJECTED = 4001

export function wasRejected(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === USER_REJECTED
}

/**
 * MetaMask checks the endpoint with `eth_chainId` before it will add anything,
 * so the usual failure is a node that is not answering. Its own wording says
 * which, and a generic message here would throw that away.
 */
export function refusalMessage(error: unknown, network: Network): string {
  const detail =
    typeof error === 'object' && error !== null && typeof (error as Error).message === 'string'
      ? (error as Error).message
      : ''

  return detail
    ? `MetaMask refused ${network.name}. ${detail}`
    : `MetaMask could not reach ${httpRpc(network)}`
}

const WITHDRAW = u8aToHex(keccakAsU8a('withdraw(bytes32,uint256)').subarray(0, 4))

const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')

/** A call that moves `amount` from whoever sends it to a substrate account. */
export function withdrawCall(publicKey: string, amount: bigint): string {
  return `${WITHDRAW}${word(publicKey)}${word(amount.toString(16))}`
}

/** Whichever accounts MetaMask has been let into, once the user allows the ask. */
export async function evmAccounts(): Promise<string[]> {
  const provider = metaMask()
  if (Capacitor.isNativePlatform()) return connectMobileMetaMask()
  if (!provider) return []

  return (await provider.request({ method: 'eth_requestAccounts' })) as string[]
}

/**
 * Points MetaMask at Numen and hands back the provider. MetaMask prices and
 * signs against whichever chain it sits on, and on any other chain the
 * precompile address is a plain account that answers anything.
 */
/** WalletConnect implementations may return eth_chainId as a number, bigint,
 * decimal string, or hexadecimal string. Normalize before comparing.
 */
export function normalizeEvmChainId(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid EVM chain ID from MetaMask')
    return `0x${value.toString(16)}`
  }
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('Invalid EVM chain ID from MetaMask')
    return `0x${value.toString(16)}`
  }
  if (typeof value === 'string') {
    const v = value.trim()
    if (/^0x[0-9a-f]+$/i.test(v)) return `0x${BigInt(v).toString(16)}`
    if (/^[0-9]+$/.test(v)) return `0x${BigInt(v).toString(16)}`
  }
  throw new Error('MetaMask returned an unsupported EVM chain ID format')
}

async function onNumen(network: Network, facts: ChainFacts): Promise<EthereumProvider> {
  // On Android use the actual WalletConnect session owner. Previously the code
  // connected, then looked up metaMask() again; a transient background/disconnect
  // flag could turn a valid pairing into the misleading 'No MetaMask found'.
  const provider = Capacitor.isNativePlatform()
    ? await connectedMobileMetaMaskProvider()
    : metaMask()
  if (!provider) throw new Error('MetaMask is not connected. Connect MetaMask first.')

  const numen = `0x${facts.evmChainId.toString(16)}`
  const sitting = normalizeEvmChainId(await provider.request({ method: 'eth_chainId' }))
  if (sitting !== numen) await addToMetaMask(network, facts)
  // Never sign on the wrong network, even if the wallet says a switch succeeded.
  const verified = normalizeEvmChainId(await provider.request({ method: 'eth_chainId' }))
  if (verified !== numen) throw new Error(`MetaMask is on chain ${verified}; select Numen (${numen}) in MetaMask and try again.`)

  return provider
}

/**
 * What the withdrawal will cost to run, asked of the same node MetaMask is on.
 * The fee comes out of the balance being moved, so the most that can be sent is
 * never the whole of it.
 */
export async function withdrawFee(
  network: Network,
  facts: ChainFacts,
  from: string,
  publicKey: string,
): Promise<bigint> {
  // Fee estimation is read-only. Never trigger WalletConnect pairing or
  // a MetaMask network switch while the user is merely editing an amount.
  const endpoint = httpRpc(network)
  const request = async (method: string, params: unknown[]): Promise<string> => {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
    const body = await response.json() as { result?: string; error?: { message?: string } }
    if (!body.result || body.error) throw new Error(body.error?.message || `${method} failed`)
    return body.result
  }
  const call = { from, to: facts.balancesErc20, data: withdrawCall(publicKey, 1n) }
  const [gas, price] = await Promise.all([
    request('eth_estimateGas', [call]), request('eth_gasPrice', []),
  ])
  return BigInt(gas) * BigInt(price)
}

/** Hands MetaMask a withdrawal to sign. */
export async function withdrawToSubstrate(
  network: Network,
  facts: ChainFacts,
  from: string,
  publicKey: string,
  amount: bigint,
): Promise<string> {
  const provider = await onNumen(network, facts)

  // Launch MetaMask for the pending approval, without starting another pairing.
  // The request is initiated first so MetaMask can display the pending signature.
  const approval = provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: facts.balancesErc20, data: withdrawCall(publicKey, amount) }],
  })
  if (Capacitor.isNativePlatform()) {
    // Allow WalletConnect to dispatch the request before Android backgrounds this app.
    await new Promise<void>((resolve) => setTimeout(resolve, 850))
    try { await openMetaMaskForApproval() } catch (error) {
      console.warn("MetaMask could not be opened automatically; approval is still pending", error)
    }
  }
  const hash = await approval
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('MetaMask did not return a valid transaction hash')
  return hash
}

/** Hands MetaMask a token transfer to sign. Gas is paid in the coin, from the same address. */
export async function sendToken(
  network: Network,
  facts: ChainFacts,
  from: string,
  token: string,
  to: string,
  amount: bigint,
): Promise<string> {
  const provider = await onNumen(network, facts)

  // Launch MetaMask for the pending approval, without starting another pairing.
  // The request is initiated first so MetaMask can display the pending signature.
  const approval = provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: token, data: transferCall(to, amount) }],
  })
  if (Capacitor.isNativePlatform()) {
    // Allow WalletConnect to dispatch the request before Android backgrounds this app.
    await new Promise<void>((resolve) => setTimeout(resolve, 850))
    try { await openMetaMaskForApproval() } catch (error) {
      console.warn("MetaMask could not be opened automatically; approval is still pending", error)
    }
  }
  const hash = await approval
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('MetaMask did not return a valid transaction hash')
  return hash
}

/** Ask MetaMask to select Numen. MetaMask must show and approve the prompt;
 * a dapp cannot silently install a chain or force WalletConnect permissions.
 */
export async function addToMetaMask(network: Network, facts: ChainFacts): Promise<void> {
  const provider = Capacitor.isNativePlatform()
    ? await connectedMobileMetaMaskProvider()
    : metaMask()
  if (!provider) throw new Error('MetaMask is not connected. Connect MetaMask first.')

  const params = evmChainParams(network, facts)
  // Initiate the RPC first, then foreground MetaMask so the pending prompt appears.
  const requestWithApproval = async (method: string, requestParams: unknown[]) => {
    const pending = provider.request({ method, params: requestParams })
    if (Capacitor.isNativePlatform()) {
      void new Promise<void>((resolve) => setTimeout(resolve, 650)).then(() => openMetaMaskForApproval()).catch(() => undefined)
    }
    return pending
  }
  try {
    await requestWithApproval('wallet_switchEthereumChain', [{ chainId: params.chainId }])
  } catch (error) {
    const code = (error as { code?: number })?.code
    const message = error instanceof Error ? error.message : String(error)
    if (code === 4001) throw error
    if (code !== 4902 && !/unrecognized|unknown chain|not added|not found/i.test(message)) throw error
    try {
      await requestWithApproval('wallet_addEthereumChain', [params])
      await requestWithApproval('wallet_switchEthereumChain', [{ chainId: params.chainId }])
    } catch (addError) {
      if (Capacitor.isNativePlatform()) {
        throw new Error(`MetaMask could not add Numen through WalletConnect. MetaMask Mobile did not accept the network-add request through WalletConnect. Add Numen in MetaMask network settings, then retry. Chain ID: ${facts.evmChainId}, RPC: ${params.rpcUrls[0]}. Details: ${addError instanceof Error ? addError.message : String(addError)}`)
      }
      throw addError
    }
  }
}

/** Poll Numen EVM for a mined transaction receipt; signing alone is not success. */
export async function waitForNumenReceipt(network: Network, hash: string): Promise<'success' | 'reverted' | 'timeout'> {
  const endpoint = httpRpc(network)
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
      })
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
      const data = await response.json() as { result?: { status?: string } | null }
      if (data.result) {
        if (data.result.status === '0x1') return 'success'
        if (data.result.status === '0x0') return 'reverted'
      }
    } catch { /* A temporary RPC outage must not be mistaken for a failed transaction. */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 3000))
  }
  return 'timeout'
}
