import { evmToSubstrate, isEvmAddress } from '@/lib/address'
import { UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'

/** Import only an EVM address explicitly approved by MetaMask (never clipboard data). */
export function importMetaMaskWatchAccount(evmAddress: string): 'created' | 'existing' {
  if (typeof evmAddress !== 'string' || !isEvmAddress(evmAddress)) {
    throw new Error('MetaMask did not return a valid EVM address.')
  }
  const address = evmToSubstrate(evmAddress)
  const store = useAccountsStore.getState()
  const existing = store.layout.watch.find((item) => item.address === address)
  if (existing) {
    store.moveAccount(address, UNGROUPED_ID, 0)
    return 'existing'
  }
  store.addWatch({ address, evmAddress, name: 'MetaMask' })
  store.moveAccount(address, UNGROUPED_ID, 0)
  return 'created'
}
