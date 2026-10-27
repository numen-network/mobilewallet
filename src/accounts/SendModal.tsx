import { useId, useState, type ReactNode } from 'react'
import { DECIMALS } from '@/chain/config'
import { useBalances, useFacts, useFeeEstimate, useSymbol } from '@/chain/queries'
import { totalOf, type AccountBalance, type Operation } from '@/chain/types'
import { resolveAddress } from '@/lib/address'
import { amountProblem, formatAmount, parseAmount } from '@/lib/balance'
import { Checkbox } from '@/components/ui/checkbox'
import { ModalFrame } from '@/ui/Modal'
import { Field as Choice, FieldError, FieldLabel } from '@/components/ui/field'
import { useDraft } from '@/ui/draft'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { useField } from '@/ui/reopen'
import { AddressField } from './AddressField'
import { AmountField } from './AmountField'
import { CallPage, SignerField, useCall, useSigning } from './Authorize'
import { BLANK, spendableOf, type Row } from './payments'
import { SendMany } from './SendManyModal'
import type { Account } from './types'

interface SendModalProps {
  account: Account
  balance: AccountBalance | undefined
  /** Accounts here that could sign for it, which only a multisig has more than one of. */
  signers: Account[]
  /** Everything the wallet holds, since anywhere it knows can be sent to. */
  accounts: Account[]
  onClose: () => void
}

type Mode = 'one' | 'many'

const MODES: TabOption<Mode>[] = [
  { id: 'one', label: 'Single' },
  { id: 'many', label: 'Batch' },
]

/** Which rows the second tab has, and which tab the dialog was left on. */
export interface SendDraft {
  mode: Mode
  rows: Row[]
}

export interface SendManyProps extends SendModalProps {
  tabs: ReactNode
  draft: SendDraft
  patch: (fields: Partial<SendDraft>) => void
  /** Drops the draft, once there is nothing left to come back to. */
  sent: () => void
}

/**
 * Paying one account and paying several are the same errand, so they are one
 * dialog with a switch rather than two ways in. The rows of the second tab are
 * a draft, since closing this by accident is not the wallet's to lose them over.
 */
export function SendModal(props: SendModalProps) {
  const [draft, patch, sent] = useDraft(`send:${props.account.address}`, {
    mode: 'one' as Mode,
    rows: [BLANK],
  })
  const tabs = <TabBar options={MODES} className="w-fit" />

  return (
    <Tabs value={draft.mode} onChange={(mode) => patch({ mode })}>
      <ModalFrame width={draft.mode === 'many' ? 650 : 580} onClose={props.onClose}>
        <TabPanel value="one">
          <SendOne {...props} tabs={tabs} />
        </TabPanel>
        <TabPanel value="many">
          <SendMany {...props} tabs={tabs} draft={draft} patch={patch} sent={sent} />
        </TabPanel>
      </ModalFrame>
    </Tabs>
  )
}

/** An EVM destination is the same pot as its mapped SS58, so it is accepted. */
function SendOne({
  account,
  balance,
  signers,
  accounts,
  tabs,
  onClose,
}: SendModalProps & { tabs: ReactNode }) {
  const symbol = useSymbol()
  const [to, setTo] = useField('to', '')
  const [amount, setAmount] = useField('amount', '')
  const [everything, setEverything] = useField('everything', false)
  const everythingId = useId()
  const call = useCall(onClose)
  const [toError, setToError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [review, setReview] = useState(false)

  const { signer, bench, choose, wrap, submit, needsPassword } = useSigning(account, signers)

  const transferable = balance?.transferable ?? 0n
  // What the chain will make of the far end. An account it has never seen has
  // to be handed enough to exist, and one that is already there has no floor
  const destination = resolveAddress(to)
  const isSelfTransfer = destination !== null && destination === account.address
  const landing = useBalances(destination ? [destination] : [])[destination ?? '']
  const fresh = destination !== null && (!landing || totalOf(landing) === 0n)
  // Anywhere else the wallet knows, since sending to this account is a no op
  const others = accounts.filter((entry) => entry.address !== account.address)
  // A transfer costs the same whatever it carries and wherever it goes, so one
  // estimate against the account itself covers the whole form
  const probe: Operation = everything
    ? { kind: 'transferAll', to: account.address }
    : { kind: 'transfer', to: account.address, amount: transferable }
  const { data: fee } = useFeeEstimate(signer.address, wrap(probe))
  const { data: facts } = useFacts()
  const ownFee = account.multisig || account.proxied ? 0n : fee
  const spendable =
    facts && ownFee !== undefined ? spendableOf(transferable, facts.existentialDeposit, ownFee) : 0n

  const form = () => {
    const destination = resolveAddress(to)
    setToError(!destination ? 'Enter a Numen or EVM address' : destination === account.address ? 'Sending to the same account wastes a network fee.' : '')
    if (!destination || destination === account.address) return false

    let operation: Operation | null = null
    if (everything) {
      operation = destination ? { kind: 'transferAll', to: destination } : null
      setAmountError('')
    } else {
      const problem = amountProblem(amount)
      if (problem) {
        setAmountError(problem)
        return false
      }
      const planck = parseAmount(amount)
      if (planck > spendable) {
        setAmountError('Enter an amount within the transferable balance, fee included')
        return false
      }
      if (facts && fresh && planck < facts.existentialDeposit) {
        setAmountError(
          `A new account needs ${formatAmount(facts.existentialDeposit, { precision: 6 })} ${symbol} to exist`,
        )
        return false
      }
      setAmountError('')
      operation = destination ? { kind: 'transfer', to: destination, amount: planck } : null
    }

    if (!operation) return false
    if (ownFee === undefined) { setAmountError('Wait for the network fee estimate before reviewing.'); return false }
    if (!review) { setReview(true); return false }

    return call.run(submit(operation, call.password))
  }

  return (
    <CallPage
      title={`Send ${symbol}`}
      submitLabel={review ? "Confirm & sign" : "Review transaction"}
      busy={call.busy}
      aside={tabs}
      footNote={
        account.multisig &&
        `Needs any ${account.multisig.threshold} of ${account.multisig.signatories.length} signatures`
      }
      from={signer.address}
      needsPassword={needsPassword}
      operation={wrap(probe)}
      password={call.password}
      onPassword={call.setPassword}
      error={call.error}
      note="Unlocks this account for one transfer"
      onClose={() => { if (review) { setReview(false); return }; onClose() }}
      onSubmit={form}
    >
      {review && <div role="region" aria-label="Transaction review" className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
        <p className="mb-2 font-semibold">Review transaction before signing</p>
        <p className="break-all"><strong>From:</strong> {account.address}</p>
        <p className="mt-1 break-all"><strong>To:</strong> {to}</p>
        <p className="mt-1"><strong>Amount:</strong> {everything ? 'Entire transferable balance (close account)' : `${amount} ${symbol}`}</p>
        <p className="mt-1"><strong>Estimated network fee:</strong> {ownFee === undefined ? 'Calculating…' : `${formatAmount(ownFee, { precision: 6 })} ${symbol}`}</p>
        {everything && <p className="mt-2 font-semibold text-destructive">This operation closes the sending account. Make sure it has no remaining assets or obligations.</p>}
        <p className="mt-2 text-muted-foreground">Confirm the complete destination address. On-chain transfers cannot be reversed.</p>
        <button type="button" onClick={() => setReview(false)} className="mt-2 rounded-lg border border-border px-3 py-1.5 font-semibold">Edit details</button>
      </div>}
      {/* The account being spent from is an address like any other, so it wears
          the same box rather than a card of its own */}
      <AddressField
        label="From"
        value={account.address}
        onChange={() => {}}
        accounts={[account]}
        aside={`transferable ${formatAmount(transferable, { precision: 4 })} ${symbol}`}
        readOnly
      />

      <SignerField account={account} signer={signer} bench={bench} onChange={choose} />

      <AddressField
        label="Address"
        value={to}
        onChange={(value) => { setTo(value); setReview(false) }}
        accounts={others}
        aside={
          fresh && facts && `needs ${formatAmount(facts.existentialDeposit, { precision: 6 })} to start`
        }
      />
      <FieldError>{toError || (isSelfTransfer ? "You cannot send funds to the same account." : "")}</FieldError>

      <AmountField
        label="Amount"
        value={everything ? formatAmount(transferable, { precision: DECIMALS, grouped: false, pad: false }) : amount}
        onChange={(value) => { setAmount(value); setReview(false) }}
        max={spendable}
        disabled={everything}
      />
      <FieldError>{amountError}</FieldError>

      <Choice orientation="horizontal" className="mt-2.5">
        <Checkbox
          id={everythingId}
          checked={everything}
          onCheckedChange={(checked) => { setEverything(checked === true); setReview(false) }}
        />
        <FieldLabel htmlFor={everythingId}>Send the full balance, closing this account</FieldLabel>
      </Choice>
    </CallPage>
  )
}
