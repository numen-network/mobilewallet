import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createRepository } from './index'
import { defaultNetwork, NETWORKS, type Network } from './config'
import { addEndpoint, allNetworks, removeEndpoint } from './custom'
import type { ChainRepository } from './types'

const NETWORK_KEY = 'numen-wallet-network'

/** The endpoint the user picked last time. Anything unknown falls to the default. */
function storedNetwork(networks: Network[]): string {
  try {
    const id = localStorage.getItem(NETWORK_KEY)
    return networks.some((network) => network.id === id) ? id! : defaultNetwork()
  } catch {
    return defaultNetwork()
  }
}

interface ChainContextValue {
  network: Network
  networks: Network[]
  repository: ChainRepository
  setNetwork: (id: string) => void
  /** Adds it and switches to it, since nobody adds one to leave it alone. */
  addNetwork: (name: string, url: string) => void
  forgetNetwork: (id: string) => void
}

const ChainContext = createContext<ChainContextValue | null>(null)

export function ChainProvider({ children }: { children: ReactNode }) {
  const [networks] = useState([NETWORKS.mainnet])
  const networkId = 'mainnet'
  const network = NETWORKS.mainnet

  const repository = useMemo(() => createRepository(network), [network])

  /**
   * Only a network the user has left behind gets disconnected. Hanging this on
   * the cleanup instead kills the live client, since React replays effects on
   * mount and a memo is not rebuilt in between. The client survives it and then
   * answers nothing, which reads as a chain where every balance is zero.
   */
  const live = useRef(repository)
  useEffect(() => {
    const left = live.current
    live.current = repository
    if (left !== repository) left.disconnect()
  }, [repository])

  const value = useMemo(() => {
    const select = (_id: string) => { /* Mainnet only */ }

    return {
      network,
      networks,
      repository,
      setNetwork: select,

      addNetwork: (_name: string, _url: string) => { /* Mainnet only */ },
      forgetNetwork: (_id: string) => { /* Mainnet only */ },
    }
  }, [network, networks, networkId, repository])

  return <ChainContext value={value}>{children}</ChainContext>
}

export function useChain(): ChainContextValue {
  const value = useContext(ChainContext)
  if (!value) throw new Error('useChain outside ChainProvider')
  return value
}
