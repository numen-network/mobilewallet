import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from 'capacitor-native-biometric'
import { Settings, X, Moon, Sun, Fingerprint, ScanFace, ShieldCheck, Trash2, AlertTriangle, Timer, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react'
import { hasAppPassword, setAppPassword, verifyAppPassword, changeAppPassword } from './appPassword'

const THEME_KEY = 'numen-mobile-theme-v1'
const BIO_KEY = 'numen-mobile-biometric-lock-v1'
const AUTO_KEY = 'numen-auto-lock-minutes-v1'
const BACKGROUND_KEY = 'numen-lock-on-background-v1'
const HIDE_KEY = 'numen-hide-balances-v1'
type Theme = 'light' | 'dark'
function themeFromStorage(): Theme {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'dark' ? 'dark' : 'light'
}
function applyTheme(theme: Theme) {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
}

// The device biometric prompt gates access to the interface; it NEVER exports,
// decrypts, or signs with the wallet's private keys. Account passwords still apply.
export function WalletSettings({ open, onClose, onLock }: { open: boolean; onClose: () => void; onLock: () => void }) {
  const [theme, setTheme] = useState<Theme>(themeFromStorage)
  const [bioEnabled, setBioEnabled] = useState(localStorage.getItem(BIO_KEY) === 'yes')
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioChecking, setBioChecking] = useState(false)
  const [bioType, setBioType] = useState('Fingerprint / Face unlock')
  const [bioFace, setBioFace] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [autoMinutes, setAutoMinutes] = useState(localStorage.getItem(AUTO_KEY) ?? '5')
  const [lockOnBackground, setLockOnBackground] = useState(localStorage.getItem(BACKGROUND_KEY) !== 'no')
  const [hideBalances, setHideBalances] = useState(localStorage.getItem(HIDE_KEY) === 'yes')
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [securityMessage, setSecurityMessage] = useState('')
  const [appPassword, setAppPasswordInput] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordCreated, setPasswordCreated] = useState(hasAppPassword())
  const [confirmation, setConfirmation] = useState('')
  const [backupAcknowledged, setBackupAcknowledged] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
    const listener = matchMedia('(prefers-color-scheme: dark)')
    const update = () => applyTheme(theme)
    listener.addEventListener('change', update)
    return () => listener.removeEventListener('change', update)
  }, [theme])

  // Re-check on each Settings opening: users may enroll biometrics in Android Settings
  // without restarting the wallet. The native OS selects the enrolled modality.
  useEffect(() => {
    if (!open) return
    let live = true
    setBioChecking(true)
    setError('')
    if (!Capacitor.isNativePlatform()) {
      setBioAvailable(false)
      setBioChecking(false)
      return () => { live = false }
    }
    void NativeBiometric.isAvailable().then(result => {
      if (!live) return
      setBioAvailable(Boolean(result.isAvailable))
      // Plugin types: 1 Touch ID, 2 Face ID, 3 Fingerprint, 4 Face authentication,
      // 5 Iris, 6 multiple. Unknown types defer to OS default.
      const type = Number(result.biometryType)
      setBioFace(type === 2 || type === 4)
      setBioType(type === 1 || type === 3 ? 'Fingerprint' : type === 2 || type === 4 ? 'Face unlock' : type === 5 ? 'Iris' : 'Fingerprint / Face unlock')
    }).catch(() => { if (live) setBioAvailable(false) }).finally(() => { if (live) setBioChecking(false) })
    return () => { live = false }
  }, [open])

  async function authenticate() {
    try {
      await NativeBiometric.verifyIdentity({ reason: 'Unlock Numen Wallet', title: 'Numen Wallet', subtitle: 'Device authentication required', description: 'Unlock the wallet interface' })
      return true
    } catch { return false }
  }

  async function toggleBiometrics() {
    if (bioEnabled) {
      const ok = await authenticate()
      if (!ok) { setError('Device authentication failed.'); return }
      localStorage.removeItem(BIO_KEY)
      setBioEnabled(false)
      return
    }
    if (!bioAvailable) { setError('No enrolled biometric method detected. Add a fingerprint or face unlock in device settings, then reopen Settings.'); return }
    if (!await authenticate()) { setError('Biometric verification failed.'); return }
    localStorage.setItem(BIO_KEY, 'yes')
    setBioEnabled(true)
    setError('')
  }

  async function createApplicationPassword() {
    setError('')
    if (newPassword !== repeatPassword) { setError('Passwords do not match.'); return }
    try { await setAppPassword(newPassword); setPasswordCreated(true); setNewPassword(''); setRepeatPassword('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to set password.') }
  }
  async function updateApplicationPassword() {
    setError(''); setSecurityMessage('')
    if (newPassword !== repeatPassword) { setError('Passwords do not match.'); return }
    try {
      await changeAppPassword(currentPassword, newPassword)
      setCurrentPassword(''); setNewPassword(''); setRepeatPassword(''); setChangingPassword(false)
      setSecurityMessage('Application password changed successfully. Account signing passwords are unchanged.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to change password.') }
  }
  async function resetWallet() {
    setError('')
    if (resetBusy) return
    if (!backupAcknowledged) { setError('Confirm that you have independently backed up every recovery phrase.'); return }
    if (confirmation !== 'DELETE') { setError('Type DELETE to confirm.'); return }
    setResetBusy(true)
    try {
      if (!passwordCreated || !await verifyAppPassword(appPassword)) { setError('Incorrect application password. Nothing was deleted.'); return }
      localStorage.clear(); sessionStorage.clear(); location.reload()
    } finally { setResetBusy(false) }
  }
  function goHome() { closeReset(); onClose() }
  function closeReset() { setResetOpen(false); setError(''); setAppPasswordInput(''); setConfirmation(''); setBackupAcknowledged(false) }

  const row = 'flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 text-left'
  return createPortal(<>
    {open && <div className="fixed inset-0 z-[120] overflow-y-auto bg-background pt-[max(32px,env(safe-area-inset-top,0px))] pb-[env(safe-area-inset-bottom,0px)]" role="dialog" aria-modal="true" aria-label="Wallet settings">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4"><div className="flex items-center gap-2 font-bold"><Settings className="size-5" /> Settings</div><button aria-label="Close settings" type="button" className="relative z-20 flex size-11 items-center justify-center rounded-lg touch-manipulation" onClick={(event) => { event.preventDefault(); event.stopPropagation(); goHome() }}><X className="size-5" /></button></header>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-5 py-6 pb-24">
        <section className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Appearance</h2>
          <div className="grid grid-cols-2 gap-2">{([['light','Light',Sun],['dark','Dark',Moon]] as const).map(([id,label,Icon]) => <button key={id} aria-pressed={theme===id} onClick={() => setTheme(id)} className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm ${theme===id?'border-primary bg-primary/10 text-primary':'border-border bg-card'}`}><Icon className="size-5" />{label}</button>)}</div>
        </section>
        <section className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Security & Privacy</h2>
          <button type="button" className={row} onClick={() => { if (!passwordCreated) { setError('Create an application password before locking.'); return } onClose(); onLock() }}><span className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><span><span className="block font-semibold">Lock wallet</span><span className="block text-xs text-muted-foreground">Unlock with app password or biometrics</span></span></span></button>
          {(bioChecking || bioAvailable) && <button className={row} onClick={() => void toggleBiometrics()} disabled={bioChecking || !bioAvailable}><span className="flex items-center gap-3">{bioFace ? <ScanFace className="size-5 text-primary" /> : <Fingerprint className="size-5 text-primary" />}<span><span className="block font-semibold">Biometric unlock</span><span className="block text-xs text-muted-foreground">{bioType} · {bioChecking?'Checking…':bioAvailable?'Available':'Unavailable'}</span></span></span><span role="switch" aria-checked={bioEnabled} className={`h-6 w-11 rounded-full p-1 ${bioEnabled?'bg-primary':'bg-muted-foreground/40'}`}><span className={`block size-4 rounded-full bg-white transition-transform ${bioEnabled?'translate-x-5':''}`} /></span></button>}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <label htmlFor="auto-lock" className="flex items-center gap-2 text-sm font-semibold"><Timer className="size-4 text-primary" />Auto-lock after inactivity</label>
            <select id="auto-lock" className="w-full rounded-xl border border-border bg-background p-3 text-sm" value={autoMinutes} onChange={e => { setAutoMinutes(e.target.value); localStorage.setItem(AUTO_KEY,e.target.value); window.dispatchEvent(new Event('numen-security-settings-changed')) }}>
              <option value="0">Immediately (30 seconds)</option><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option>
            </select>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Lock when app goes to background</span><input type="checkbox" className="size-5 accent-primary" checked={lockOnBackground} onChange={e => { setLockOnBackground(e.target.checked); localStorage.setItem(BACKGROUND_KEY,e.target.checked?'yes':'no'); window.dispatchEvent(new Event('numen-security-settings-changed')) }} /></label>
          </div>
          <label className={row}><span className="flex items-center gap-3"><EyeOff className="size-5 text-primary"/><span><span className="block font-semibold">Hide balances</span><span className="block text-xs text-muted-foreground">Mask the main balance and token amounts</span></span></span><input type="checkbox" className="size-5 accent-primary" checked={hideBalances} onChange={e => {setHideBalances(e.target.checked);localStorage.setItem(HIDE_KEY,e.target.checked?'yes':'no');window.dispatchEvent(new Event('numen-security-settings-changed'))}} /></label>
          <div className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Biometrics unlock the app interface only. Passwords are still required for signing transactions and exporting keys.</div>
        </section>
        <section className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Application password</h2>
          {passwordCreated ? <div className="space-y-3 rounded-2xl border border-border bg-card p-4"><p className="text-sm">Application password is configured. Account signing passwords remain separate.</p><button type="button" className="flex items-center gap-2 text-sm font-semibold text-primary" onClick={() => {setChangingPassword(v=>!v);setError('');setSecurityMessage('')}}><KeyRound className="size-4"/>Change application password</button>{changingPassword && <div className="space-y-3"><input aria-label="Current application password" type="password" autoComplete="current-password" placeholder="Current password" className="w-full rounded-xl border border-border bg-background p-3" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/><input aria-label="New application password" type="password" autoComplete="new-password" placeholder="New password (10+ characters)" className="w-full rounded-xl border border-border bg-background p-3" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><input aria-label="Confirm new application password" type="password" autoComplete="new-password" placeholder="Confirm new password" className="w-full rounded-xl border border-border bg-background p-3" value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/><button type="button" className="w-full rounded-xl bg-primary p-3 font-semibold text-primary-foreground" onClick={()=>void updateApplicationPassword()}>Save new password</button></div>}</div> : <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Set an application password for wallet reset. Account passwords remain separate.</p>
            <input aria-label="New application password" type="password" autoComplete="new-password" placeholder="Application password (10+ characters)" className="w-full rounded-xl border border-border bg-background p-3" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <input aria-label="Confirm application password" type="password" autoComplete="new-password" placeholder="Confirm application password" className="w-full rounded-xl border border-border bg-background p-3" value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} />
            <button type="button" className="w-full rounded-xl bg-primary p-3 font-semibold text-primary-foreground" onClick={() => void createApplicationPassword()}>Set application password</button>
          </div>}</section>
        <section className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wallet data</h2>
          <button className={`${row} border-destructive/40 text-destructive`} onClick={() => {setError('');setResetOpen(true)}}><span className="flex items-center gap-3"><Trash2 className="size-5" /><span><span className="block font-semibold">Reset wallet</span><span className="block text-xs">Remove all locally stored accounts and preferences</span></span></span></button>
        </section>
        {securityMessage && <p role="status" className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-sm"><CheckCircle2 className="size-4" />{securityMessage}</p>}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </main>
    </div>}
    {resetOpen && <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Reset wallet confirmation">
      <section className="w-full max-w-md space-y-4 rounded-3xl bg-card p-6 shadow-2xl"><h2 className="flex items-center gap-2 text-lg font-bold text-destructive"><AlertTriangle className="size-6" />Reset wallet</h2>
        <p className="text-sm">This permanently removes local accounts, encrypted key files, account history stored on this device, and wallet preferences. It does not move on-chain funds. Back up every recovery phrase first.</p>
        <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><input type="checkbox" className="mt-1 size-5 accent-destructive" checked={backupAcknowledged} onChange={e => setBackupAcknowledged(e.target.checked)} /><span>I have backed up and verified the recovery phrase or private key for <strong>every account</strong> outside this device. I understand that deleting the only copy can permanently destroy access to funds.</span></label>
        <label className="block text-sm"><span className="mb-1 block">Application password</span><input type="password" autoComplete="off" className="w-full rounded-xl border border-border bg-background p-3" value={appPassword} onChange={e => setAppPasswordInput(e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block">Type DELETE to confirm</span><input autoComplete="off" className="w-full rounded-xl border border-border bg-background p-3" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        {!passwordCreated && <p role="alert" className="text-sm text-destructive">Set an application password first.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3"><button className="flex-1 rounded-xl border border-border p-3" onClick={closeReset}>Cancel</button><button className="flex-1 rounded-xl bg-destructive p-3 font-semibold text-white" disabled={!passwordCreated || !backupAcknowledged || confirmation !== 'DELETE' || resetBusy} onClick={() => void resetWallet()}>Reset wallet</button></div>
      </section>
    </div>}
  </>, document.body)
}
