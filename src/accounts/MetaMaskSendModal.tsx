import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { openMetaMaskForApproval } from '@/evm/mobileWalletConnect'
import { TOKENS } from '@/chain/config'
import { postJson } from '@/network/http'
import { NAME_CALL, SYMBOL_CALL, DECIMALS_CALL, balanceOfCall, readBalance, readToken } from '@/evm/erc20'
import type { Token } from '@/chain/types'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts } from '@/chain/queries'
import { totalOf } from '@/chain/types'
import {
  evmAccounts,
  metaMask,
  sendToken,
  wasRejected,
  withdrawFee,
  waitForNumenReceipt,
  withdrawToSubstrate,
} from '@/evm/metamask'
import { cn } from '@/lib/cn'
import { evmToSubstrate, isEvmAddress, publicKeyOf, shorten } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { Field, INSIDE } from '@/ui/Field'
import { LEDE, Modal } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { FieldError, NOTE } from '@/components/ui/field'
import { toast, toastProblem } from '@/ui/Toast'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { tokenAmount, useHoldings, type Holding } from './tokens'
import { compactTokenBalance } from './TokenBalanceText'
import { TokenLogo } from './TokenLogo'
import type { Account } from './types'
import { rememberEvmSend } from './evmActivity'

/** The Token box's value for the coin, which no contract address can clash with. */
const COIN = 'coin'

const NONE: Holding[] = []

/**
 * An EVM address spends from a substrate account derived by hashing it, and
 * nobody holds a key to that account. So whatever leaves it is a call the EVM
 * side signs, and MetaMask is what signs it. The wallet only writes the call
 * down. The coin goes back to a Numen account and a token to another H160.
 */
export function MetaMaskSendModal({
  source,
  accountAddress,
  accounts,
  initial,
  onClose,
}: {
  /** The EVM address the money leaves. */
  source: string
  /** Native address used as the key for user-added EVM tokens. */
  accountAddress: string
  accounts: Account[]
  /** The holding the dialog opens with. Without one it opens on the coin. */
  initial?: Holding | undefined
  onClose: () => void
}) {
  const { network } = useChain()
  const { data: facts } = useFacts()
  // Until the chain answers, the holding the dialog opened with stands in for it
  const chainHoldings = useHoldings(source)
  const [evmHoldings, setEvmHoldings] = useState<Holding[]>([])
  const [tokensLoading, setTokensLoading] = useState(true)
  const [tokensError, setTokensError] = useState('')
  // The Assets page reads tokens directly from the EVM RPC, including tokens
  // added through Manage Tokens. The Send picker must use the same sources.
  useEffect(() => {
    let cancelled = false
    const read = async (address: string, data: string): Promise<string> => {
      const response = await postJson<{ result?: string; error?: { message?: string } }>(
        'https://rpc.numen-network.org',
        { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: address, data }, 'latest'] },
      )
      if (response.error || !response.result || response.result === '0x') throw new Error(response.error?.message || 'EVM RPC call failed')
      return response.result
    }
    const loadTokens = async () => {
      setTokensLoading(true)
      setTokensError('')
      try {
        const key = `numen-mobile-custom-tokens-mainnet-v2:${accountAddress.toLowerCase()}`
        let custom: Token[] = []
        try { const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(parsed)) custom = parsed.filter((item): item is Token => !!item && typeof item.address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item.address)) } catch { /* Invalid local data is ignored */ }
        const known = TOKENS[32026] ?? []
        const entries = [...new Map([...known, ...custom].map(item => [item.address.toLowerCase(), item])).values()]
        let failed = 0
        const results = await Promise.all(entries.map(async entry => {
          const address = entry.address.toLowerCase()
          try {
            const [name, symbol, decimals, rawBalance] = await Promise.all([
              read(address, NAME_CALL), read(address, SYMBOL_CALL), read(address, DECIMALS_CALL),
              read(address, balanceOfCall(source)),
            ])
            const balance = readBalance(rawBalance)
            if (balance <= 0n) return null
            return { token: { ...readToken(address, { name, symbol, decimals }), icon: entry.icon || '' }, balance } as Holding
          } catch { failed += 1; return null }
        }))
        if (!cancelled) {
          setEvmHoldings(results.filter((item): item is Holding => item !== null))
          if (failed) setTokensError(`Could not read ${failed} token contract(s). Check the network connection.`)
        }
      } catch {
        if (!cancelled) setTokensError('Could not load EVM token balances. Please retry.')
      } finally { if (!cancelled) setTokensLoading(false) }
    }
    void loadTokens()
    return () => { cancelled = true }
  }, [source, accountAddress])
  const holdings = [...new Map([...(initial ? [initial] : NONE), ...(chainHoldings ?? NONE), ...evmHoldings].map(item => [item.token.address.toLowerCase(), item])).values()]

  const [held, setHeld] = useState<string[]>([])
  const [picked, setPicked] = useState(initial?.token.address ?? COIN)
  const [to, setTo] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [txHash, setTxHash] = useState('')
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    evmAccounts().then(setHeld, () => setError('MetaMask would not say which accounts it holds'))
  }, [])


  const token = holdings.find((entry) => entry.token.address === picked)
  // The EVM address and the account it spends from are one balance, so the
  // wallet can read what is there without asking MetaMask
  const mirror = evmToSubstrate(source)
  const balances = useBalances([mirror])
  const there = balances[mirror] ? totalOf(balances[mirror]) : 0n
  // A reserve cannot leave the account, so only the transferable part can go
  const movable = balances[mirror]?.transferable ?? 0n
  // An H160 added to the wallet is stored as the account it spends from, so the
  // two ends can name the same place. Sending there costs gas and moves nothing
  const itself = mirror === to
  const target = recipient.trim()
  const same = (address: string | null) => typeof address === 'string' && address.toLowerCase() === source.toLowerCase()
  // A token sent to its own contract lands in a balance no key can move
  const lost = token !== undefined && target.toLowerCase() === token.token.address
  // Only an H160 can hold a token, so no Numen address is offered
  const others = accounts.flatMap((account) =>
    account.evmAddress && !same(account.evmAddress)
      ? [{ address: account.evmAddress, name: account.name }]
      : [],
  )
  const ready = token ? isEvmAddress(target) && !same(target) && !lost : to !== '' && !itself
  // The signature comes from MetaMask, so an address it has not been let into
  // is one nothing here can spend from
  const signable = held.some((entry) => typeof entry === 'string' && entry.toLowerCase() === source.toLowerCase())
  // Gas is taken from the balance being moved, so the most that can go is what
  // is left after it. A MAX that spends the lot is a transfer that always fails
  const sendable = fee !== null && movable > fee ? movable - fee : 0n

  useEffect(() => {
    // Nothing to price when the call is never going out
    if (!to || itself || !facts) { setFee(null); return }
    setFee(null)
    withdrawFee(network, facts, source, publicKeyOf(to)).then(setFee, () => setFee(null))
  }, [network, source, itself, to, facts])

  const send = async () => {
    if (busy || confirmed) return false
    setError('')
    const decimals = token?.token.decimals
    const problem = amountProblem(amount, 1n, decimals)
    if (problem) { setError(problem); return false }
    const planck = parseAmount(amount, decimals)
    if (planck > (token?.balance ?? movable)) {
      setError('More than that address can send')
      return false
    }
    if (!facts || !ready) return false
    if (!token && (fee === null || planck > sendable)) { setError('Network fee is not ready or the amount exceeds the balance after fees.'); return false }
    if (!review) { setReview(true); return false }

    setBusy(true)
    setStage('Waiting for MetaMask approval. Approve the transaction in MetaMask, then return here. Do not submit it twice.')
    setTxHash('')
    try {
      // On Android, connect only when the user explicitly taps Ask MetaMask.
      // This removes the extra connection button without skipping authorization.
      const allowed = Capacitor.isNativePlatform() ? await evmAccounts() : held
      setHeld(allowed)
      if (!allowed.some((address) => typeof address === 'string' && address.toLowerCase() === source.toLowerCase())) {
        throw new Error('Select the matching EVM account in MetaMask. The connected account cannot spend from this address.')
      }
      const hash = token
        ? await sendToken(network, facts, source, token.token.address, target, planck)
        : await withdrawToSubstrate(network, facts, source, publicKeyOf(to), planck)
      setTxHash(hash)
      rememberEvmSend({ hash, from: source, to: token ? target : to, amount, symbol: token?.token.symbol ?? 'NUMN', networkId: network.id })
      setStage('Submitted to Numen. Waiting for on-chain confirmation…')
      toast('Transaction submitted. Waiting for confirmation…')
      const outcome = await waitForNumenReceipt(network, hash)
      if (outcome === 'reverted') throw new Error('Transaction failed on-chain. No successful transfer was confirmed.')
      if (outcome === 'timeout') {
        setStage('Confirmation is taking longer than expected. Check the transaction on Numen Explorer before sending again.')
        setError('Confirmation not yet available. Do not resend until you check the transaction hash.')
        return false
      }
      setStage('Transaction confirmed on Numen! You may now close this screen.')
      setConfirmed(true)
      toast('Transaction confirmed successfully!')
    } catch (problem) {
      if (wasRejected(problem)) {
        setStage('Transaction rejected in MetaMask. No transaction was submitted.')
      } else {
        const message = problem instanceof Error ? problem.message : 'MetaMask turned it down'
        setError(message)
        toastProblem(message)
      }
    } finally {
      setBusy(false)
    }
    return false
  }

  if (metaMask() === null && !Capacitor.isNativePlatform()) {
    return (
      <Modal title="Send from MetaMask" submitLabel="Done" cancelLabel={null} onClose={onClose}>
        <p className={LEDE}>
          No MetaMask on this browser. It holds the key to the EVM address, so nothing here can
          move those funds without it.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Send from MetaMask"
      submitLabel={confirmed ? "Done" : review ? "Ask MetaMask" : "Review transaction"}
      busy={busy}
      cancelLabel={busy || confirmed ? null : "Cancel"}
      disabled={(!confirmed && (!ready || !facts)) || busy}
      onClose={() => { if (busy) return; if (review && !confirmed) { setReview(false); return }; onClose() }}
      onSubmit={() => { if (confirmed) { onClose(); return false }; void send(); return false }}
    >
      {review && !confirmed && <div role="region" aria-label="Transaction review" className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
        <p className="mb-2 font-semibold">Review transaction before signing</p>
        <p className="break-all"><strong>From:</strong> {source}</p>
        <p className="mt-1 break-all"><strong>To:</strong> {token ? target : to}</p>
        <p className="mt-1"><strong>Amount:</strong> {amount} {token?.token.symbol ?? facts?.symbol ?? 'NUMN'}</p>
        <p className="mt-1"><strong>Network:</strong> Numen Mainnet (32026)</p>
        <p className="mt-1"><strong>Network fee:</strong> {token ? 'Calculated by MetaMask (NUMN gas)' : fee !== null ? `Estimated reserve ${formatAmount(fee, { precision: 6 })} NUMN; final gas in MetaMask` : 'Calculated by MetaMask'}</p>
        <p className="mt-2 text-muted-foreground">Check the full destination address and amount in MetaMask. This action cannot be reversed.</p>
        <button type="button" className="mt-2 rounded-lg border border-border px-3 py-1.5 font-semibold" onClick={() => setReview(false)}>Edit details</button>
      </div>}
      {/* MetaMask holds this address, so it is not one of the wallet's accounts
          and the box takes a list of its own */}
      <AddressField
        label="From"
        value={source}
        onChange={() => {}}
        accounts={[{ address: source, name: shorten(source) }]}
        aside={`holds ${formatAmount(there, { precision: 4 })} ${facts?.symbol ?? ''}`}
        readOnly
      />
      {!Capacitor.isNativePlatform() && held.length > 0 && !signable && (
        <p className="mt-1.5 text-[12.5px] text-destructive">
          MetaMask has not been let into this address, so nothing here can move what sits there
        </p>
      )}

      <Field label="Token" aside={token && `holds ${compactTokenBalance(tokenAmount(token))} ${token.token.symbol}`}>
        <Select
          value={token ? picked : COIN}
          onValueChange={(value) => { setPicked(value); setReview(false) }}
          options={[
            {
              value: COIN,
              label: facts?.symbol ?? '',
              icon: <TokenLogo symbol="NUMN" size={18} />,
              detail: formatAmount(there, { precision: 4 }),
            },
            ...holdings.map((holding) => ({
              value: holding.token.address,
              label: holding.token.symbol,
              icon: <TokenLogo symbol={holding.token.symbol} size={18} />,
              detail: <span title={tokenAmount(holding)}>{compactTokenBalance(tokenAmount(holding))}</span>,
            })),
          ]}
          label="Token"
          className={INSIDE}
        >
          {<TokenLogo symbol={token?.token.symbol ?? "NUMN"} size={18} />}
        </Select>
      </Field>

      {token ? (
        <>
          <AddressField
            label="To"
            value={recipient}
            onChange={(value) => { setRecipient(value); setReview(false) }}
            accounts={others}
            evm
          />
          {same(target) && (
            <p className="mt-1.5 text-[12.5px] text-destructive">That is the address sending it</p>
          )}
          {lost && (
            <p className="mt-1.5 text-[12.5px] text-destructive">
              That is the token's own contract. Anything sent there is gone for good
            </p>
          )}
        </>
      ) : (
        <>
          <AddressField label="Into" value={to} onChange={(value) => { setTo(value); setReview(false) }} accounts={accounts} />
          {itself && (
            <p className="mt-1.5 text-[12.5px] text-destructive">
              This account is that EVM address, so its balance is already here
            </p>
          )}
        </>
      )}

      <AmountField
        label="Amount"
        value={amount}
        onChange={(value) => { setAmount(value); setReview(false) }}
        max={token?.balance ?? sendable}
        unit={token?.token}
      />
      {tokensLoading && <p role="status" className="mt-2 text-xs text-muted-foreground">Loading EVM tokens…</p>}
      {tokensError && <p role="alert" className="mt-2 text-xs text-destructive">{tokensError}</p>}
      {stage && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-muted px-3 py-2 text-[12px]">{stage}</p>}
      {busy && !txHash && Capacitor.getPlatform() === 'android' && (
        <button type="button" className="mt-2 w-full rounded-lg border border-primary px-3 py-3 text-sm font-semibold text-primary"
          onClick={() => { void openMetaMaskForApproval().catch((error: unknown) => setError(error instanceof Error ? error.message : String(error))) }}>
          Open MetaMask to Approve
        </button>
      )}
      {txHash && <div className="mt-2 rounded-lg border border-border p-2 text-[11px]">
        <p className="font-semibold">Transaction hash</p>
        <p className="break-all text-muted-foreground">{txHash}</p>
        <a href={`${network.explorer.replace(/\/$/, '')}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary underline">View on Numen Explorer</a>
      </div>}
      <FieldError>{error}</FieldError>

      {!token && fee !== null && (
        <p className={cn('mt-2.5', NOTE)}>
          MAX keeps {formatAmount(fee, { precision: 6 })} {facts?.symbol ?? ''} back for gas.
        </p>
      )}
    </Modal>
  )
}
