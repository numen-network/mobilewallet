import { useEffect, useState } from 'react'
import { Fingerprint, ScanFace, LockKeyhole } from 'lucide-react'
import numenLogo from '@/assets/numen-logo.png'
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from 'capacitor-native-biometric'
import { hasAppPassword, verifyAppPassword } from './appPassword'
const BIO_KEY = 'numen-mobile-biometric-lock-v1'
export function AppLock({ locked, unlock }: { locked: boolean; unlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioMethod, setBioMethod] = useState<'fingerprint' | 'face' | 'other' | null>(null)
  useEffect(() => {
    if (!locked || !Capacitor.isNativePlatform() || localStorage.getItem(BIO_KEY) !== 'yes') { setBioMethod(null); return }
    let active = true
    void NativeBiometric.isAvailable().then(result => {
      if (!active) return
      if (!result.isAvailable) { setBioMethod(null); return }
      const type = Number(result.biometryType)
      setBioMethod(type === 1 || type === 3 ? 'fingerprint' : type === 2 || type === 4 ? 'face' : 'other')
    }).catch(() => { if (active) setBioMethod(null) })
    return () => { active = false }
  }, [locked])
  useEffect(() => { if (locked) { setPassword(''); setError('') } }, [locked])
  async function passwordUnlock(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try { if (await verifyAppPassword(password)) { setPassword(''); setError(''); unlock() } else setError('Incorrect application password.') }
    finally { setBusy(false) }
  }
  async function biometricUnlock() {
    if (busy || !Capacitor.isNativePlatform() || localStorage.getItem(BIO_KEY) !== 'yes') return
    setBusy(true)
    try {
      const available = await NativeBiometric.isAvailable()
      if (!available.isAvailable) { setBioMethod(null); setError('Biometric authentication unavailable. Use your password.'); return }
      await NativeBiometric.verifyIdentity({ reason: 'Unlock Numen Wallet', title: 'Numen Wallet', subtitle: 'Authenticate to unlock' })
      setError(''); unlock()
    } catch { setError('Biometric authentication failed. Use your password.') }
    finally { setBusy(false) }
  }
  if (!locked) return null
  return <div role="dialog" aria-modal="true" aria-label="Wallet locked" className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-background px-5 py-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
    <div className="my-auto w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card px-6 py-7 text-center shadow-xl">
      <img src={numenLogo} alt="Numen Network logo" className="mx-auto size-[76px] rounded-2xl object-contain" />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Welcome Numen</h1>
        <p className="text-sm text-muted-foreground">Unlock Numen Wallet to Continue</p>
      </div>
      <form onSubmit={e => void passwordUnlock(e)} className="space-y-3 text-left">
        <label htmlFor="numen-app-lock-password" className="block text-sm font-medium">Application Password</label>
        <div className="flex items-center gap-2">
          <input id="numen-app-lock-password" autoFocus type="password" autoComplete="off" placeholder="Enter Your Password" value={password} onChange={e => setPassword(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          {bioMethod && <button type="button" disabled={busy} aria-label={bioMethod === 'face' ? 'Unlock with face recognition' : bioMethod === 'fingerprint' ? 'Unlock with fingerprint' : 'Unlock with device biometrics'} title="Unlock with biometrics" onClick={() => void biometricUnlock()} className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary text-primary disabled:opacity-50">{bioMethod === 'face' ? <ScanFace className="size-6" /> : <Fingerprint className="size-6" />}</button>}
        </div>
        <button disabled={busy || !password || !hasAppPassword()} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 font-semibold text-primary-foreground disabled:opacity-50"><LockKeyhole className="size-4" />Unlock Wallet</button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="border-t border-border pt-5">
        <p className="text-base font-semibold leading-snug text-primary">Bringing the Real World On-Chain.</p>
      </div>
    </div>
  </div>
}
