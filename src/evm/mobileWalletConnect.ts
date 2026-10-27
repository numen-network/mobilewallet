/** WalletConnect v2 transport for the installed MetaMask Mobile app.
 * No seed phrase or private key is transferred to the wallet.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import EthereumProvider from '@walletconnect/ethereum-provider'

const NUMEN_CHAIN = 32026
const FALLBACK_CHAIN = 1

type WCProvider = InstanceType<typeof EthereumProvider>
const MetaMaskLauncher = registerPlugin<{ openPairing(options: { uri: string }): Promise<void>; openDapp(): Promise<void>; openWallet(): Promise<void> }>('MetaMaskLauncher')

async function openMetaMaskPairing(uri: string): Promise<void> {
  // Android launches MetaMask using ACTION_VIEW rather than an HTML anchor in WebView.
  if (Capacitor.getPlatform() === 'android') {
    await MetaMaskLauncher.openPairing({ uri })
    return
  }
  const deeplink = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`
  window.location.href = deeplink
}

let providerPromise: Promise<WCProvider> | null = null
let currentProvider: WCProvider | null = null
let connecting: Promise<string[]> | null = null

export function mobileMetaMaskProvider(): WCProvider | null {
  // A live provider instance can temporarily report disconnected when Android
  // backgrounds the WebView. Do not turn that transient state into 'not installed'.
  return currentProvider ?? null
}

/** Reuse the WalletConnect provider that owns the approved session. */
export async function connectedMobileMetaMaskProvider(): Promise<WCProvider> {
  const provider = await initialize()
  if (!provider.connected) {
    // Re-pair only if the old WalletConnect session is no longer active.
    await connectMobileMetaMask()
  }
  if (!provider.connected) {
    throw new Error('MetaMask WalletConnect session is disconnected. Reconnect MetaMask and approve the connection.')
  }
  return provider
}

async function initialize(): Promise<WCProvider> {
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
  if (!projectId || projectId === 'BURAYA_PROJECT_ID') throw new Error('WalletConnect Project ID missing. Set VITE_WALLETCONNECT_PROJECT_ID in .env.local and rebuild.')
  if (!providerPromise) {
    providerPromise = EthereumProvider.init({
      projectId,
      // Require Numen in the approved WalletConnect namespace. Ethereum is optional.
      // MetaMask versions that reject custom required chains need the web-wallet fallback.
      chains: [FALLBACK_CHAIN],
      optionalChains: [NUMEN_CHAIN],
      optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_sendTransaction', 'eth_estimateGas', 'eth_gasPrice'],
      showQrModal: !Capacitor.isNativePlatform(),
      metadata: {
        name: 'Numen Wallet',
        description: 'Numen mobile wallet',
        url: 'https://numen-network.org',
        icons: ['https://numen-network.org/favicon.ico'],
        redirect: { native: 'org.numen.network.wallet://', universal: 'https://numen-network.org' },
      },
    }).then((provider) => {
      provider.on('display_uri', (uri: string) => {
        if (!Capacitor.isNativePlatform()) return
        void openMetaMaskPairing(uri).catch((error: unknown) => {
          console.error('MetaMask native launch failed', error)
          window.dispatchEvent(new CustomEvent('numen:metamask-launch-error', {
            detail: error instanceof Error ? error.message : String(error),
          }))
        })
      })
      provider.on('disconnect', () => { currentProvider = null })
      currentProvider = provider
      return provider
    }).catch((error) => { providerPromise = null; throw error })
  }
  return providerPromise
}

/** WalletConnect restricts requests to CAIP-2 chains granted in the session. */
export function hasNumenSession(provider: WCProvider): boolean {
  const session = provider.session as { namespaces?: Record<string, { chains?: string[]; accounts?: string[] }> } | undefined
  const namespaces = session?.namespaces ?? {}
  return Object.values(namespaces).some((ns) =>
    ns.chains?.includes('eip155:32026') || ns.accounts?.some((account) => account.startsWith('eip155:32026:'))
  )
}

export async function connectMobileMetaMask(): Promise<string[]> {
  if (connecting) return connecting
  connecting = (async () => {
    const provider = await initialize()
    // Keep an existing approved WalletConnect session. Forcing Numen into
    // required chains caused MetaMask Mobile to reject previously working pairings.
    // The chain is requested as optional; network selection is handled separately.
    if (!provider.connected) await provider.connect()
    if (!provider.connected) throw new Error('MetaMask connection was not approved.')
    currentProvider = provider
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    if (!accounts.length) throw new Error('MetaMask did not share an EVM account.')
    return accounts
  })()
  try { return await connecting } finally { connecting = null }
}

export async function disconnectMobileMetaMask(): Promise<void> {
  if (currentProvider?.connected) await currentProvider.disconnect()
  currentProvider = null
  providerPromise = null
}

/** Reliable fallback: use the original web wallet INSIDE MetaMask's own browser.
 * The user must press Add to MetaMask there and approve the network prompt.
 * This does not assert that WalletConnect supports wallet_addEthereumChain.
 */
export async function openNumenWebWalletInMetaMask(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await MetaMaskLauncher.openDapp()
    return
  }
  window.location.href = 'https://metamask.app.link/dapp/wallet.numen-network.org'
}

/** Bring an existing MetaMask session to the foreground for a pending signature.
 * This does not initiate a new WalletConnect session. */
/** Open MetaMask after the WalletConnect request has had a chance to reach the relay.
 * Android does not guarantee that the wallet will foreground itself for WC requests.
 * Never issue another transaction when reopening the wallet. */
export async function openMetaMaskForApproval(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await MetaMaskLauncher.openWallet()
}
