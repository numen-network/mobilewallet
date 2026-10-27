import { NumenBlocks } from './accounts/NumenBlocks'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import logo from '@/assets/numen-logo.png'
import { IndexerStatus } from '@/graphql/IndexerStatus'
import { usingMock } from '@/chain'
import { EndpointModal } from '@/chain/EndpointModal'
import { useChain } from '@/chain/provider'
import { useBalances, useFacts, useHead, useReach } from '@/chain/queries'
import { quality, type Quality } from '@/chain/reach'
import { lockedOf, totalOf, ZERO_BALANCE, type Token } from '@/chain/types'
import { addToMetaMask, metaMask, refusalMessage, wasRejected } from '@/evm/metamask'
import { connectMobileMetaMask, openNumenWebWalletInMetaMask } from '@/evm/mobileWalletConnect'
import { importMetaMaskWatchAccount } from '@/accounts/importMetaMaskWatch'
import { formatAmount } from '@/lib/balance'
import { plural } from '@/lib/plural'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { CAPTION } from '@/components/ui/field'
import { Footer } from '@/ui/Footer'
import WalletMetamask from '@web3icons/react/icons/wallets/WalletMetamask'
import {
  Globe2,
  Search,
  ArrowUpRight,
  MessageCircle,
  Send as TelegramIcon,
  ArrowLeftRight,
  Compass,
  Activity,
  House,
  Box as BoxIcon,
  ScanLine,
  Landmark,
  type LucideIcon,
  Plus,
  RefreshCw,
  Signature,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
  ChevronDown,
  Settings2,
  Settings,
  ShieldCheck,
  Trash2,
  X,
  Pencil,
  KeyRound,
  FileDown,
  Send,
  ArrowDownToLine,
  Wallet,
  ExternalLink,
} from 'lucide-react'
import { ConfirmModal, PromptModal } from '@/ui/PromptModal'
import { FormScope, useDialog } from '@/ui/reopen'
import { Select } from '@/ui/Select'
import { SHELL } from '@/ui/shell'
import { TabBar, TabPanel, Tabs, type TabOption } from '@/ui/Tabs'
import { Tip } from '@/ui/Tip'
import { ToolButton } from '@/ui/ToolButton'
import { ToastHost, toast, toastProblem } from '@/ui/Toast'
import { AddAccountModal } from '@/accounts/AddAccountModal'
import { FromJsonModal } from '@/accounts/FromJsonModal'
import { JobsHost } from '@/accounts/JobsHost'
import { BackupModal } from '@/accounts/BackupModal'
import { DelegateModal, UndelegateModal } from '@/accounts/DelegateModal'
import { DeriveModal } from '@/accounts/DeriveModal'
import { ClearIdentityModal, IdentityModal } from '@/accounts/IdentityModal'
import { JudgementModal } from '@/accounts/JudgementModal'
import { AddProxyModal, RemoveProxyModal } from '@/accounts/ProxyModal'
import { ForgetModal } from '@/accounts/ForgetModal'
import { MultisigModal } from '@/accounts/MultisigModal'
import { PasswordModal } from '@/accounts/PasswordModal'
import { PendingModal } from '@/accounts/PendingModal'
import { ProxiedModal } from '@/accounts/ProxiedModal'
import { QuitSubModal, SubsModal } from '@/accounts/SubsModal'
import { SignModal } from '@/accounts/SignModal'
import { VestingModal } from '@/accounts/VestingModal'
import { MetaMaskSendModal } from '@/accounts/MetaMaskSendModal'
import { TokenBalancesModal } from '@/accounts/TokenBalancesModal'
import { MobileTokenManager } from '@/accounts/MobileTokenManager'
import { WalletSettings } from '@/accounts/WalletSettings'
import { AppLock } from '@/accounts/AppLock'
import { hasAppPassword } from '@/accounts/appPassword'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import type { Holding } from '@/accounts/tokens'
import { ReceiveModal } from '@/accounts/ReceiveModal'
import { JudgeModal, SetFeeModal } from '@/accounts/JudgeModal'
import { SendModal } from '@/accounts/SendModal'
import { UnlockModal } from '@/accounts/UnlockModal'
import { ValidatorModal } from '@/accounts/ValidatorModal'
import { GovernanceView } from '@/governance/GovernanceView'
import { voters } from '@/governance/Voter'
import { isSystemGroup, UNGROUPED_ID } from '@/accounts/layout'
import { useAccountsStore } from '@/accounts/store'
import { useAccounts } from '@/accounts/useAccounts'
import { Identicon } from '@/ui/Identicon'
import { shorten } from '@/lib/address'
import { CopyButton } from '@/ui/CopyButton'
import { canSend, signersFor, type Account } from '@/accounts/types'
import type { CardAction } from '@/accounts/AccountCard'

const EXPLORER_URL = 'https://explorer.numen-network.org/'

async function openExplorer(url: string = EXPLORER_URL): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Android Custom Tabs / iOS SFSafariViewController: shown within the app,
      // not embedded as an iframe (which the explorer CSP forbids).
      await Browser.open({ url, presentationStyle: 'fullscreen' })
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    toastProblem(error instanceof Error ? error.message : String(error))
  }
}

type Modal =
  | { kind: 'add'; initialKind?: 'create' | 'phrase' | 'watch' }
  | { kind: 'fromJson' }
  | { kind: 'multisig' }
  | { kind: 'proxied' }
  | { kind: 'send'; address: string }
  | { kind: 'receive'; address: string; token?: Token }
  | { kind: 'renameAccount'; address: string }
  | { kind: 'changePassword'; address: string }
  | { kind: 'backup'; address: string }
  | { kind: 'identity'; address: string }
  | { kind: 'judgement'; address: string }
  | { kind: 'clearIdentity'; address: string }
  | { kind: 'quitSub'; address: string }
  | { kind: 'derive'; address: string }
  | { kind: 'delegate'; address?: string; to?: string }
  | { kind: 'undelegate'; address: string }
  | { kind: 'addProxy'; address: string }
  | { kind: 'removeProxy'; address: string }
  | { kind: 'unlock'; address: string }
  | { kind: 'pending'; address: string }
  | { kind: 'subs'; address: string }
  | { kind: 'vesting'; address: string }
  | { kind: 'judge'; address: string }
  | { kind: 'setFee'; address: string }
  | { kind: 'sign'; address?: string }
  | { kind: 'metaMaskSend'; address: string; holding?: Holding }
  | { kind: 'validator'; address: string }
  | { kind: 'tokenBalances'; address: string }
  | { kind: 'endpoint' }
  | { kind: 'forget'; address: string }
  | { kind: 'newGroup' }
  | { kind: 'renameGroup'; id: string }
  | { kind: 'deleteGroup'; id: string }

/** How much of the signal is lit, in what colour, and what to call it. */
const GRADE: Record<Quality, { lit: LucideIcon; tint: string; word: string }> = {
  good: { lit: SignalHigh, tint: 'text-good', word: 'good link' },
  fair: { lit: SignalMedium, tint: 'text-warn', word: 'a slow link' },
  poor: { lit: SignalLow, tint: 'text-destructive', word: 'a bad link' },
}

const SIGNAL_BOX = '-2.5 2 24 24'

/**
 * The lit bars over all of them faint, so what is missing reads as clearly as
 * what is there. The box hangs off centre because the glyph does, Lucide draws
 * the bars into the bottom left of it and centring the box would leave them low
 * and left of whatever sits beside them.
 */
function SignalBars({ lit: Lit, className }: { lit: LucideIcon; className: string }) {
  const layer = 'col-start-1 row-start-1 size-full'

  return (
    <span className={cn('grid', className)}>
      <SignalHigh viewBox={SIGNAL_BOX} className={cn(layer, 'opacity-25')} strokeWidth={2.6} />
      <Lit viewBox={SIGNAL_BOX} className={layer} strokeWidth={2.6} />
    </span>
  )
}

/** Which node the wallet talks to, whether it shipped with one or was told. */
function EndpointPicker({ onAdd }: { onAdd: () => void }) {
  const { network, networks, setNetwork } = useChain()
  const head = useHead()
  const { data: reach } = useReach()
  // The mock issues blocks too, so an arriving head proves nothing about a node
  const connected = !usingMock && head !== null
  const grade = connected && reach ? quality(reach) : null
  // The pill has room for the bars and a number, the rest of it goes on hover
  const health = reach
    ? `, ${GRADE[grade ?? 'poor'].word}, ${plural(reach.peers, 'peer')}${
        reach.syncing ? ', still catching up' : ''
      }`
    : ''

  return (
    <>
      <Select
        value={network.id}
        onValueChange={setNetwork}
        options={networks.map((option) => ({ value: option.id, label: option.name }))}
        label="RPC endpoint"
        hint={usingMock ? 'Nothing is connected, balances are invented' : `${network.rpc}${health}`}
        variant="pill"
      >
        <SignalBars
          lit={grade ? GRADE[grade].lit : SignalZero}
          className={cn('size-3.5 shrink-0', grade ? GRADE[grade].tint : 'text-dim')}
        />
        {reach && <span className="text-dim tabular-nums">{Math.round(reach.ms)} ms</span>}
      </Select>

      <Tip text="Add an endpoint">
        <Button type="button" variant="ghost" size="icon" aria-label="Add an endpoint" onClick={onAdd}>
          <Plus />
        </Button>
      </Tip>

      {usingMock && (
        <Tip text="No node is attached. Every balance on this page is made up">
          <Badge variant="destructive">
            mock data
          </Badge>
        </Tip>
      )}
    </>
  )
}

/**
 * The EVM side of Numen is MetaMask's job. One click hands it the network so
 * the wallet never has to carry a second signing stack.
 */


function AccountStartChoices({ onCreate, onImport, onConnect, busy = false }: { onCreate: () => void; onImport: () => void; onConnect: () => void; busy?: boolean }) {
  const choices = [
    { title: 'Create New Account', description: 'Create a new Numen account.', icon: <Plus className="size-5" />, action: onCreate },
    { title: 'Connect MetaMask', description: 'Link MetaMask for EVM accounts. Signing stays in MetaMask.', icon: <WalletMetamask className="size-6" />, action: onConnect },
    { title: 'Import Wallet', description: 'Restore an existing Numen account from seed.', icon: <FileDown className="size-5" />, action: onImport },
  ]
  return <div className="space-y-3">
    {choices.map(({ title, description, icon, action }) => <button key={title} type="button" disabled={busy} onClick={action} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted disabled:opacity-50">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs leading-5 text-muted-foreground">{description}</span></span>
      <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />
    </button>)}
  </div>
}

function AccountStart({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  const [busy, setBusy] = useState(false)
  const { network } = useChain()
  const { data: facts } = useFacts()
  const connect = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (!Capacitor.isNativePlatform()) {
        const provider = metaMask()
        if (!provider) throw new Error('MetaMask browser extension not found.')
        const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
        if (!accounts.length) throw new Error('MetaMask did not share an address.')
        const result = importMetaMaskWatchAccount(accounts[0])
        toast(result === 'created' ? 'MetaMask account added.' : 'MetaMask account already exists.')
      } else {
        const addresses = await connectMobileMetaMask()
        if (!facts) throw new Error('Numen network information is still loading. Please retry.')
        await addToMetaMask(network, facts)
        const result = importMetaMaskWatchAccount(addresses[0])
        toast(result === 'created' ? 'MetaMask account added.' : 'MetaMask account already exists.')
      }
    } catch (error) {
      toastProblem(`MetaMask connection: ${error instanceof Error ? error.message : String(error)}`)
    } finally { setBusy(false) }
  }
  return <AccountStartChoices onCreate={onCreate} onImport={onImport} onConnect={() => void connect()} busy={busy} />
}

function MetaMaskButton() {
  const { network } = useChain()
  const { data: facts } = useFacts()
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (Capacitor.isNativePlatform()) {
        toast('Connecting to MetaMask Mobile… approve the request in MetaMask.')
        const approvedAddresses = await connectMobileMetaMask()
        const imported = importMetaMaskWatchAccount(approvedAddresses[0])
        toast(imported === 'created' ? 'MetaMask account linked. Approve EVM transactions in MetaMask.' : 'MetaMask EVM account is already in Numen Wallet.')
      }
      if (!facts) throw new Error('Numen network information is still loading. Reopen and try again.')
      await addToMetaMask(network, facts)
      toast('Numen Network is selected in MetaMask')
    } catch (error) {
      if (!wasRejected(error)) {
        const detail = error instanceof Error ? error.message : String(error)
        toastProblem(`MetaMask connection: ${detail}. If network addition is unsupported through WalletConnect, add Numen directly in MetaMask network settings (Chain ID 32026), then retry.`)
      }
    } finally { setBusy(false) }
  }
  return <ToolButton icon={<WalletMetamask className="size-5" />} label={busy ? 'Connecting…' : 'Add to MetaMask'} disabled={busy} onClick={() => void add()} />
}

type View = 'accounts' | 'registry' | 'verify' | 'blocks' | 'activity' | 'governance'

const MOBILE_SECTIONS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'accounts', label: 'Home', icon: House },
  { id: 'registry', label: '3D Registry', icon: BoxIcon },
  { id: 'verify', label: '3D Verify', icon: ScanLine },
  { id: 'blocks', label: 'Numen Blocks', icon: BoxIcon },
  { id: 'activity', label: 'Explore', icon: Compass },
  { id: 'governance', label: 'Governance', icon: Landmark },
]

// External links are deliberately allowlisted; NumenDEX is not yet a verified live trading deployment.
const EXPLORE_LINKS: { title: string; subtitle: string; url: string; icon: LucideIcon; tone: string }[] = [
  { title: 'Numen Web', subtitle: 'Official website', url: 'https://www.numen-network.org/', icon: Globe2, tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950' },
  { title: 'Web Wallet', subtitle: 'Browser wallet', url: 'https://wallet.numen-network.org/', icon: Wallet, tone: 'text-violet-600 bg-violet-100 dark:bg-violet-950' },
  { title: 'Explorer', subtitle: 'Blocks & transactions', url: EXPLORER_URL, icon: Activity, tone: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950' },
  { title: 'GitHub', subtitle: 'Open-source code', url: 'https://github.com/numen-network', icon: ExternalLink, tone: 'text-foreground bg-muted' },
  { title: 'Telegram', subtitle: 'Community updates', url: 'https://t.me/numen_network', icon: TelegramIcon, tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950' },
  { title: 'Discord', subtitle: 'Community chat', url: 'https://discord.gg/ajPKdvrvJK', icon: MessageCircle, tone: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950' },
  { title: 'X', subtitle: 'News & announcements', url: 'https://x.com/NumenOnchain', icon: X, tone: 'text-foreground bg-muted' },
  { title: 'NumenDEX', subtitle: 'In development · Learn more', url: 'https://numen-network.org/ecosystem/numendex/', icon: ArrowLeftRight, tone: 'text-teal-600 bg-teal-100 dark:bg-teal-950' },
]

function ExploreView() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const visibleLinks = EXPLORE_LINKS.filter(({ title, subtitle }) =>
    `${title} ${subtitle}`.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase()),
  )

  return <main className={cn(SHELL, 'mx-auto w-full max-w-2xl px-4 pb-8 pt-4 sm:pt-8')}>
    <div className="mb-4 rounded-3xl border border-cyan-200/60 bg-gradient-to-br from-sky-50 via-cyan-50 to-white px-5 py-5 dark:border-cyan-900 dark:from-slate-900 dark:via-slate-900 dark:to-background">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-cyan-700 dark:text-cyan-300"><Compass className="size-4"/> Numen ecosystem</div>
      <h1 className="text-2xl font-bold tracking-tight">Explore Numen</h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">Explore wallets, network tools, development and community.</p>
    </div>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Discover & connect</h2>
      <button type="button" onClick={() => { setSearchOpen(v => !v); setSearchTerm('') }} aria-label={searchOpen ? 'Close search' : 'Search Explore links'} aria-expanded={searchOpen} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm"><Search className="size-4" /> Search</button>
    </div>
    {searchOpen && <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-primary/30"><Search className="size-4 shrink-0 text-muted-foreground"/><input type="search" autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search Numen links..." aria-label="Search Numen links" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" /></div>}
    <div className="flex flex-col gap-3">
      {visibleLinks.map(({ title, subtitle, url, icon: Icon, tone }) => <button key={title} type="button" onClick={() => void openExplorer(url)} aria-label={`Open ${title}`} className="group flex min-h-[106px] w-full items-stretch overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 active:scale-[.99]">
        <span className={cn('relative flex w-[116px] shrink-0 items-center justify-center overflow-hidden border-r border-border/40 sm:w-[150px]', tone)} aria-hidden="true">
          <svg viewBox="0 0 150 110" className="absolute inset-0 h-full w-full opacity-25" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="115" cy="-3" r="55"/><circle cx="115" cy="-3" r="35"/><circle cx="-5" cy="105" r="55"/><path d="M0 65 Q75 10 150 90 M0 83 Q75 30 150 108" />
          </svg>
          <span className="relative grid size-16 place-items-center rounded-2xl border border-white/40 bg-white/60 shadow-sm dark:bg-black/20"><Icon className="size-9" strokeWidth={1.8}/></span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
          <span className="flex items-center justify-between gap-2 text-[15px] font-semibold"><span>{title}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/></span>
          <span className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</span>
          <span className="mt-2 text-[11px] font-medium text-primary">Open link</span>
        </span>
      </button>)}
      {visibleLinks.length === 0 && <p className="rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">No links found. Try another search.</p>}
    </div>
    <p className="mt-5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">Links open in your device browser. NumenDEX is under development and opens an information page. Verify URLs before connecting your wallet.</p>
  </main>
}

function ComingSoon({ title, description, Icon, section }: { title: string; description: string; Icon: LucideIcon; section?: 'registry' | 'verify' }) {
  const registry = section === 'registry'
  return (
    <main className={cn(SHELL, 'flex items-start justify-center px-3 py-4')}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-cyan-50 to-white px-6 pb-7 pt-8 text-center dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full border border-cyan-200/60 dark:border-cyan-800/40" />
          <div className="pointer-events-none absolute -left-10 top-12 size-28 rounded-full border border-sky-200/60 dark:border-sky-800/40" />
          <div className="relative mx-auto mb-4 flex size-24 items-center justify-center rounded-3xl border border-cyan-100 bg-white/90 text-cyan-600 shadow-[0_12px_35px_rgba(8,145,178,0.13)] dark:border-cyan-900 dark:bg-slate-800 dark:text-cyan-400">
            {registry ? (
              <svg viewBox="0 0 96 96" className="size-20" role="img" aria-label="3D model registered with a digital fingerprint">
                <path d="M48 8 78 25 48 42 18 25Z" fill="#cffafe" stroke="currentColor" strokeWidth="2"/><path d="M18 25v35l30 18V42ZM78 25v35L48 78V42Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m48 8 0 34" stroke="currentColor" strokeDasharray="3 4"/><circle cx="76" cy="72" r="16" fill="#0891b2"/><path d="m69 72 5 5 9-11" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 96 96" className="size-20" role="img" aria-label="Scanning and verifying a 3D object's on-chain record">
                <path d="M16 31V16h16M64 16h16v15M16 65v15h16M64 80h16V65" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="m48 26 21 12v24L48 74 27 62V38Z" fill="#cffafe" stroke="currentColor" strokeWidth="2"/><path d="m27 38 21 12 21-12M48 50v24" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 51h72" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4 3"/>
              </svg>
            )}
            <span className="absolute -bottom-1 -right-1 size-5 rounded-lg border-4 border-white bg-cyan-500 dark:border-slate-800" />
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400">Coming Soon</div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{registry ? 'What you will be able to do' : 'Designed for trusted verification'}</div>
          <div className="grid grid-cols-2 gap-2.5">
            {(registry ? [
              ['3D fingerprints', 'Identify registered models'],
              ['On-chain records', 'Track registration history'],
            ] : [
              ['Model lookup', 'Find 3D object records'],
              ['Record checks', 'Review on-chain evidence'],
            ]).map(([heading, detail]) => (
              <div key={heading} className="rounded-2xl border border-border bg-muted/30 p-3 text-left">
                <div className="mb-2 flex size-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"><Icon className="size-4" /></div>
                <div className="text-xs font-semibold">{heading}</div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">These features are planned and are not available for transactions yet.</p>
          {section && <IndexerStatus section={section} />}
        </div>
      </div>
    </main>
  )
}

function Stat({ label, planck, lead = false }: { label: string; planck: bigint; lead?: boolean }) {
  const { data: facts } = useFacts()

  return (
    <div>
      <div className={CAPTION}>{label}</div>
      <div
        className={cn(
          'mt-1 font-mono font-semibold tracking-tight',
          lead ? 'text-3xl max-[560px]:text-2xl' : 'text-xl text-muted-foreground',
        )}
      >
        {formatAmount(planck, { precision: 2 })}
        <span className={cn('ml-1 font-semibold', lead ? 'text-sm text-muted-foreground' : 'text-[11px] text-dim')}>
          {facts?.symbol ?? ''}
        </span>
      </div>
    </div>
  )
}

const DELEGATE_PARAM = 'delegate'

/** A `?delegate=` link opens the delegation dialog with the delegate filled in. */
function linkedDelegation(): Modal | null {
  const to = new URLSearchParams(location.search).get(DELEGATE_PARAM)
  return to === null ? null : { kind: 'delegate', to }
}

export function App() {
  const { accounts, byAddress, groups, connectExtension } = useAccounts()
  const store = useAccountsStore()
  const dialog = useDialog<Modal>(linkedDelegation)
  const { modal, close, open: setModal } = dialog
  const [view, setView] = useState<View>('accounts')
  const [activeAddress, setActiveAddress] = useState<string | null>(null)
  const [accountListOpen, setAccountListOpen] = useState(false)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const [walletSettingsOpen, setWalletSettingsOpen] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [assetsRefreshing, setAssetsRefreshing] = useState(false)
  const [refreshNotice, setRefreshNotice] = useState<'updating' | 'updated' | 'error' | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshBusy = useRef(false)
  const queryClient = useQueryClient()
  const handleRefreshStateChange = useCallback((loading: boolean) => setAssetsRefreshing(loading), [])
  const refreshAllAssets = useCallback(() => {
    if (refreshBusy.current) return
    refreshBusy.current = true
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    setRefreshNotice('updating')
    setAssetsRefreshing(true)
    // Incrementing this key re-subscribes native NUMN balances and refreshes EVM tokens.
    setRefreshNonce(value => value + 1)
    void (async () => {
      try {
        await queryClient.invalidateQueries()
        // Keep feedback visible long enough to be noticed on fast connections.
        await new Promise<void>(resolve => { refreshTimer.current = setTimeout(resolve, 1300) })
        setRefreshNotice('updated')
      } catch {
        setRefreshNotice('error')
      } finally {
        refreshBusy.current = false
        setAssetsRefreshing(false)
        refreshTimer.current = setTimeout(() => setRefreshNotice(null), 2400)
      }
    })()
  }, [queryClient])
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }, [])
  const [appLocked, setAppLocked] = useState(() => hasAppPassword())
  const [hideBalances, setHideBalances] = useState(() => localStorage.getItem('numen-hide-balances-v1') === 'yes')
  useEffect(() => {
    const sync = () => setHideBalances(localStorage.getItem('numen-hide-balances-v1') === 'yes')
    window.addEventListener('numen-security-settings-changed', sync)
    return () => window.removeEventListener('numen-security-settings-changed', sync)
  }, [])
  useEffect(() => {
    if (appLocked || !hasAppPassword()) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (timeout) clearTimeout(timeout)
      const minutes = Number(localStorage.getItem('numen-auto-lock-minutes-v1') ?? '5')
      timeout = setTimeout(() => setAppLocked(true), minutes === 0 ? 30000 : Math.max(1, minutes) * 60000)
    }
    const background = () => {
      if (document.visibilityState === 'hidden' && localStorage.getItem('numen-lock-on-background-v1') !== 'no') setAppLocked(true)
    }
    const events = ['pointerdown','keydown','touchstart'] as const
    events.forEach(event => window.addEventListener(event, arm, {passive:true}))
    window.addEventListener('numen-security-settings-changed', arm)
    document.addEventListener('visibilitychange', background)
    arm()
    return () => {
      if (timeout) clearTimeout(timeout)
      events.forEach(event => window.removeEventListener(event, arm))
      window.removeEventListener('numen-security-settings-changed', arm)
      document.removeEventListener('visibilitychange', background)
    }
  }, [appLocked])
  const [header, setHeader] = useState<HTMLElement | null>(null)
  // Centralized navigation: overlays first, then return to Home.
  useEffect(() => {
    const back = () => {
      if (appLocked) return
      if (walletSettingsOpen) { setWalletSettingsOpen(false); setView('accounts'); return }
      if (accountSettingsOpen) { setAccountSettingsOpen(false); return }
      if (accountListOpen) { setAccountListOpen(false); return }
      if (view !== 'accounts') { setView('accounts'); return }
    }
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); back() } }
    window.addEventListener('keydown', keydown)
    let live = true
    const handle = Capacitor.isNativePlatform() ? CapacitorApp.addListener('backButton', () => { if(live) back() }) : null
    return () => { live=false; window.removeEventListener('keydown', keydown); void handle?.then(h => h.remove()) }
  }, [view, walletSettingsOpen, accountSettingsOpen, accountListOpen, appLocked])


  const addresses = useMemo(() => accounts.map((account) => account.address), [accounts])
  const activeAccount = accounts.find((account) => account.address === activeAddress) ?? accounts[0]
  const balances = useBalances(addresses, refreshNonce)
  const facts = useFacts()

  const summary = accounts.reduce(
    (totals, account) => {
      const balance = balances[account.address]
      if (!balance) return totals
      return {
        total: totals.total + totalOf(balance),
        transferable: totals.transferable + balance.transferable,
        locked: totals.locked + lockedOf(balance),
      }
    },
    { total: 0n, transferable: 0n, locked: 0n },
  )

  const selected =
    modal && 'address' in modal && modal.address ? byAddress.get(modal.address) : undefined
  const signers = selected ? signersFor(selected, accounts) : []
  const targetGroup =
    modal && 'id' in modal ? store.layout.groups.find((group) => group.id === modal.id) : undefined

  const delegators = voters(accounts)

  // Taken off the address bar once read, so a reload does not ask again
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.delete(DELEGATE_PARAM)
    history.replaceState(history.state, '', url)
  }, [])

  const deleteGroup = (id: string) => {
    store.removeGroup(id)
    toast('Group deleted')
    close()
  }

  // Stable, so a card can skip re-rendering while a drag reflows the board
  const open = useMemo(
    () => (action: CardAction, account: Account) =>
      setModal({ kind: action, address: account.address }),
    [],
  )

  return (
    <Tabs value={view} onChange={(next) => { setView(next) }}>
      <header ref={setHeader} className="sticky top-0 z-40 border-b border-border bg-card pt-[max(0px,env(safe-area-inset-top,0px))]">
        <div className={cn(SHELL, 'flex flex-wrap items-center gap-3 py-2.5')}>
          <div className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <img src={logo} width={22} height={22} alt="" />
            Numen Wallet
          </div>


          <span className="flex-1" />
          <button type="button" aria-label="Refresh wallet" title="Refresh wallet" disabled={assetsRefreshing} onClick={refreshAllAssets} className="rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><RefreshCw className={cn('size-5', assetsRefreshing && 'animate-spin')} /></button>
          <button type="button" aria-label="Wallet settings" title="Wallet settings" onClick={() => { if (!walletSettingsOpen) setWalletSettingsOpen(true) }} className="rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-5" /></button>

        </div>
      </header>
      {refreshNotice && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[75] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-primary/20 bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg">
          <span className="flex items-center gap-2">
            <RefreshCw className={cn('size-4 text-primary', refreshNotice === 'updating' && 'animate-spin')} />
            {refreshNotice === 'updating' ? 'Updating Wallet...' : refreshNotice === 'updated' ? 'Wallet Refresh Requested' : 'Could Not Refresh Wallet'}
          </span>
        </div>
      )}

      {facts.isError ? (
        <main className={cn(SHELL, 'grow pt-20')}>
          <Empty className="mx-auto mt-0 max-w-md border-solid">
            <EmptyHeader>
              <EmptyTitle className="font-bold">This endpoint answers for a different chain.</EmptyTitle>
              <EmptyDescription>{(facts.error as Error).message}</EmptyDescription>
              <EmptyDescription>Pick another endpoint from the header.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </main>
      ) : (
        <>
          <TabPanel value="registry" className="numen-page-scroll">
            <ComingSoon title="3D Registry" description="Register and manage 3D objects on Numen. This feature is in development." Icon={BoxIcon} section="registry" />
          </TabPanel>
          <TabPanel value="verify" className="numen-page-scroll">
            <ComingSoon title="3D Verify" description="Verify 3D object records on Numen. This feature is in development." Icon={ScanLine} section="verify" />
          </TabPanel>
          <TabPanel value="blocks" className="numen-page-scroll">
            <NumenBlocks onClose={() => setView('verify')} />
          </TabPanel>
          <TabPanel value="activity" className="numen-page-scroll">
            <ExploreView />
          </TabPanel>
          <TabPanel value="governance" className="numen-page-scroll">
            <GovernanceView accounts={accounts} balances={balances} />
          </TabPanel>
          <TabPanel value="accounts" className="numen-page-scroll">
            <main className={cn(SHELL, 'grow px-3 pb-24 pt-3 sm:pt-6')}>
              {accounts.length > 0 && activeAccount ? (
                <>
                  <div className="relative mx-auto max-w-md">
                    <button type="button" className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm" onClick={() => { setAccountListOpen(!accountListOpen); setAccountSettingsOpen(false) }}>
                      <Identicon address={activeAccount.address} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{activeAccount.name}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">Numen · {shorten(activeAccount.address)}</span>
                      </span>
                      <ChevronDown className="size-5 text-muted-foreground" />
                    </button>
                    <button type="button" aria-label={`Settings for ${activeAccount.name}`} onClick={() => { setAccountSettingsOpen(true); setAccountListOpen(false) }} className="absolute right-12 top-1/2 -translate-y-1/2 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings2 className="size-5" /></button>
                    {accountListOpen && (
                      <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-border bg-card p-2 shadow-xl">
                        {accounts.map((account) => (
                          <button key={account.address} type="button" onClick={() => { setActiveAddress(account.address); setAccountListOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted">
                            <Identicon address={account.address} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{account.name}</span><span className="block text-xs text-muted-foreground">{account.evmAddress ? 'MetaMask · ' : 'Numen · '}{shorten(account.address)}</span></span>
                            {activeAccount.address === account.address && <span className="text-primary">✓</span>}
                          </button>
                        ))}
                        <div className="mt-3 border-t border-border pt-3"><AccountStart onCreate={() => { setAccountListOpen(false); setModal({kind:'add',initialKind:'create'}) }} onImport={() => { setAccountListOpen(false); setModal({kind:'add',initialKind:'phrase'}) }} /></div>
                      </div>
                    )}
                  </div>
                  <div className="mx-auto mt-3 max-w-md text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Numen Network</p>
                    <p className="mt-1.5 font-mono text-[clamp(2rem,8vw,3rem)] font-bold tracking-tight">{hideBalances ? '••••' : formatAmount(totalOf(balances[activeAccount.address] ?? ZERO_BALANCE), {precision:2})} <span className="text-xl">NUMN</span></p>
                    <div className="mt-1 flex flex-col items-center gap-1 text-xs text-muted-foreground">
                      <div className="flex max-w-full items-center justify-center gap-1.5">
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">Numen Address</span>
                        <span className="truncate font-mono">{shorten(activeAccount.address)}</span>
                        <CopyButton text={activeAccount.address} label="Copy Numen address" />
                        <button type="button" aria-label="View Numen address in Explorer" title="View in Numen Explorer" onClick={() => void openExplorer(`${EXPLORER_URL}account/${encodeURIComponent(activeAccount.address)}`)} className="rounded-md p-1 hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></button>
                      </div>
                      {activeAccount.evmAddress && (
                        <div className="flex max-w-full items-center justify-center gap-1.5">
                          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">EVM Address</span>
                          <span className="truncate font-mono">{shorten(activeAccount.evmAddress)}</span>
                          <CopyButton text={activeAccount.evmAddress} label="Copy EVM address" />
                        </div>
                      )}
                    </div>
                    <div className="mx-auto mt-4 mb-2 flex max-w-[230px] justify-center gap-10">
                      <button type="button" disabled={!canSend(activeAccount) && !activeAccount.evmAddress} onClick={() => setModal({kind: activeAccount.evmAddress ? 'metaMaskSend' : 'send',address:activeAccount.address})} className="flex flex-col items-center gap-2 text-xs font-medium disabled:opacity-40"><span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Send className="size-6" /></span>Send</button>
                      <button type="button" onClick={() => setModal({kind:'receive',address:activeAccount.address})} className="flex flex-col items-center gap-2 text-xs font-medium"><span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><ArrowDownToLine className="size-6" /></span>Receive</button>
                    </div>
                  </div>
                  <MobileTokenManager key={activeAccount.address} accountAddress={activeAccount.address} evmAddress={activeAccount.evmAddress} refreshNonce={refreshNonce} onRefreshStateChange={handleRefreshStateChange} nativeBalance={hideBalances ? '••••' : formatAmount(totalOf(balances[activeAccount.address] ?? ZERO_BALANCE), {precision:2})} hideBalances={hideBalances} />

                </>
              ) : (
                <div className="mx-auto mt-14 max-w-md rounded-3xl border border-dashed border-border bg-card px-7 py-12 text-center">
                  <span className="mx-auto mb-5 grid size-20 place-items-center rounded-2xl bg-primary/10"><img src={logo} alt="Numen logo" className="size-14 object-contain" /></span>
                  <h1 className="text-xl font-bold">Welcome to Numen Wallet</h1>
                  <p className="mt-3 mb-6 text-sm leading-6 text-muted-foreground">Choose how you'd like to get started.</p>
                  <AccountStart onCreate={() => setModal({kind:'add',initialKind:'create'})} onImport={() => setModal({kind:'add',initialKind:'phrase'})} />
                </div>
              )}
            </main>
          </TabPanel>
        </>
      )}

      <WalletSettings open={walletSettingsOpen} onClose={() => { setWalletSettingsOpen(false); setAccountSettingsOpen(false); setAccountListOpen(false); setView('accounts'); window.scrollTo(0, 0) }} onLock={() => { setWalletSettingsOpen(false); setView('accounts'); setAppLocked(true) }} />
      <AppLock locked={appLocked} unlock={() => { setAppLocked(false); setView('accounts') }} />
      {accountSettingsOpen && activeAccount && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountSettingsOpen(false) }}>
          <section role="dialog" aria-modal="true" aria-label="Account settings" className="max-h-[calc(100dvh-48px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><Identicon address={activeAccount.address} /><div className="min-w-0"><h2 className="font-bold">{activeAccount.name}</h2><p className="truncate font-mono text-xs text-muted-foreground">{shorten(activeAccount.address)}</p></div></div>
              <button type="button" aria-label="Close settings" onClick={() => setAccountSettingsOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="space-y-1">
              <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => { setAccountSettingsOpen(false); setModal({kind:'renameAccount',address:activeAccount.address}) }}><Pencil className="size-5" />Rename this account</button>
              {activeAccount.source === 'keystore' && <>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => { setAccountSettingsOpen(false); setModal({kind:'changePassword',address:activeAccount.address}) }}><KeyRound className="size-5" />Change password</button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted" onClick={() => { setAccountSettingsOpen(false); setModal({kind:'backup',address:activeAccount.address}) }}><FileDown className="size-5" />Create a backup file</button>
              </>}
              <div className="my-2 border-t border-border" />
              {activeAccount.source === 'keystore' ? (
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => { setAccountSettingsOpen(false); setModal({kind:'forget',address:activeAccount.address}) }}><Trash2 className="size-5" />Forget this account</button>
              ) : (
                <div className="rounded-xl px-3 py-3 text-xs text-muted-foreground">Forgetting this account is disabled because this account does not have a local password to verify.</div>
              )}
            </div>
          </section>
        </div>
      )}

      <nav aria-label="Main navigation" className="numen-bottom-navigation fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="numen-bottom-navigation-items mx-auto flex max-w-3xl gap-0.5 overflow-x-auto px-1">
          {MOBILE_SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setView(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              aria-current={view === id ? 'page' : undefined}
              className={cn(
                'flex min-w-[62px] flex-1 min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs',
                view === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-[19px]" aria-hidden="true" />
              <span className="whitespace-nowrap text-[9px] sm:text-xs">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className="hidden sm:block"><Footer /></div>

      <FormScope
        key={dialog.scope.key}
        seed={dialog.scope.seed}
        retrying={dialog.scope.retrying}
        reopen={dialog.scope.reopen}
      >
        {modal?.kind === 'add' && (
          <AddAccountModal key={modal.initialKind ?? 'create'} initialKind={modal.initialKind} connectExtension={connectExtension} onClose={close} />
        )}

        {modal?.kind === 'fromJson' && <FromJsonModal onClose={close} />}

        {modal?.kind === 'multisig' && <MultisigModal accounts={accounts} onClose={close} />}

        {modal?.kind === 'proxied' && <ProxiedModal accounts={accounts} onClose={close} />}

        {modal?.kind === 'send' && selected && (
          <SendModal
            account={selected}
            accounts={accounts}
            balance={balances[selected.address]}
            signers={signers}
            onClose={close}
          />
        )}


        {modal?.kind === 'pending' && selected && (
          <PendingModal
            account={selected}
            accounts={accounts}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'subs' && selected && (
          <SubsModal
            account={selected}
            accounts={accounts}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'quitSub' && selected && (
          <QuitSubModal account={selected} signers={signers} onClose={close} />
        )}

        {modal?.kind === 'sign' && (
          <SignModal accounts={accounts} initial={modal.address} onClose={close} />
        )}

        {modal?.kind === 'vesting' && selected && (
          <VestingModal
            account={selected}
            accounts={accounts}
            signers={signers}
            balance={balances[selected.address]}
            onClose={close}
          />
        )}

        {modal?.kind === 'judge' && selected && (
          <JudgeModal
            account={selected}
            accounts={accounts}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'setFee' && selected && (
          <SetFeeModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'metaMaskSend' && selected?.evmAddress && (
          <MetaMaskSendModal
            source={selected.evmAddress}
            accountAddress={selected.address}
            accounts={accounts}
            initial={modal.holding}
            onClose={close}
          />
        )}

        {modal?.kind === 'tokenBalances' && selected?.evmAddress && (
          <TokenBalancesModal
            account={selected}
            source={selected.evmAddress}
            onSend={(holding) =>
              setModal({ kind: 'metaMaskSend', address: selected.address, holding })
            }
            onReceive={(token) => setModal({ kind: 'receive', address: selected.address, token })}
            onClose={close}
          />
        )}

        {modal?.kind === 'receive' && selected && (
          <ReceiveModal account={selected} token={modal.token} onClose={close} />
        )}

        {modal?.kind === 'renameAccount' && selected && (
          <PromptModal
            title="Rename this account"
            label="Name"
            initial={selected.name}
            submitLabel="Save"
            onClose={close}
            onSubmit={(name) => store.renameAccount(selected.address, name)}
          />
        )}

        {modal?.kind === 'changePassword' && selected && (
          <PasswordModal account={selected} onClose={close} />
        )}

        {modal?.kind === 'backup' && selected && (
          <BackupModal account={selected} onClose={close} />
        )}

        {modal?.kind === 'identity' && selected && (
          <IdentityModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'judgement' && selected && (
          <JudgementModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'clearIdentity' && selected && (
          <ClearIdentityModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'derive' && selected && (
          <DeriveModal account={selected} onClose={close} />
        )}

        {modal?.kind === 'delegate' && delegators && (
          <DelegateModal
            delegators={delegators}
            accounts={accounts}
            balances={balances}
            from={modal.address ?? delegators[0].address}
            to={modal.to ?? ''}
            onClose={close}
          />
        )}

        {modal?.kind === 'undelegate' && selected && (
          <UndelegateModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'addProxy' && selected && (
          <AddProxyModal
            account={selected}
            accounts={accounts}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'removeProxy' && selected && (
          <RemoveProxyModal
            account={selected}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'unlock' && selected && (
          <UnlockModal
            account={selected}
            accounts={accounts}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'validator' && selected && (
          <ValidatorModal
            account={selected}
            balance={balances[selected.address]}
            signers={signers}
            onClose={close}
          />
        )}

        {modal?.kind === 'endpoint' && <EndpointModal onClose={close} />}

        {modal?.kind === 'forget' && selected && (
          <ForgetModal account={selected} onClose={close} />
        )}

        {modal?.kind === 'newGroup' && (
          <PromptModal
            title="New group"
            label="Name"
            submitLabel="Create"
            onClose={close}
            onSubmit={(name) => store.addGroup(name)}
          />
        )}

        {modal?.kind === 'renameGroup' && targetGroup && (
          <PromptModal
            title="Rename group"
            label="Name"
            initial={targetGroup.name}
            submitLabel="Save"
            onClose={close}
            onSubmit={(name) => store.renameGroup(targetGroup.id, name)}
          />
        )}

        {modal?.kind === 'deleteGroup' && targetGroup && !isSystemGroup(targetGroup) && (
          <ConfirmModal
            title="Delete group"
            submitLabel="Delete"
            onClose={close}
            onConfirm={() => deleteGroup(targetGroup.id)}
          >
            {plural(targetGroup.accounts.length, 'account')} will move to{' '}
            {store.layout.groups.find((group) => group.id === UNGROUPED_ID)?.name}.
          </ConfirmModal>
        )}
      </FormScope>

      <JobsHost />
      <ToastHost header={header} />
    </Tabs>
  )
}
