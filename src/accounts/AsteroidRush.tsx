import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pause, Play, RotateCcw, Trophy } from 'lucide-react'

type Rock = { x: number; z: number; radius: number; spin: number; energy: boolean; hit?: boolean }
const KEY = 'numen.arcade.asteroid-rush.best.v1'
const W = 360, H = 520

export function AsteroidRush({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const held = useRef(0)
  const steer = useRef<number | null>(null)
  const running = useRef(false)
  const paused = useRef(false)
  const [phase, setPhase] = useState<'ready' | 'playing' | 'paused' | 'over'>('ready')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } })
  const state = useRef({ x: 0, rocks: [] as Rock[], score: 0, lives: 3, ticks: 0, spawn: 0, invulnerable: 0, previous: 0 })

  const start = useCallback(() => {
    state.current = { x: 0, rocks: [], score: 0, lives: 3, ticks: 0, spawn: 0, invulnerable: 0, previous: 0 }
    held.current = 0; steer.current = null; running.current = true; paused.current = false
    setScore(0); setLives(3); setPhase('playing')
  }, [])
  const togglePause = () => { paused.current = !paused.current; setPhase(paused.current ? 'paused' : 'playing') }

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let id = 0
    const project = (x: number, z: number) => {
      const depth = Math.max(0.01, (z + 1) / 2)
      return { x: W / 2 + x * (35 + depth * 130), y: 108 + depth * 350, scale: 0.25 + depth * 1.25 }
    }
    const loop = (now: number) => {
      const s = state.current
      const dt = Math.min(2.5, (now - (s.previous || now)) / 16.67)
      s.previous = now
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#06101f'); bg.addColorStop(1, '#102e4b')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
      // Stars and converging perspective rails create a sense of 3D depth.
      for (let i = 0; i < 60; i++) {
        const sy = (i * 83.19 + s.ticks * (0.15 + i % 4 * 0.13)) % H
        ctx.fillStyle = `rgba(192,231,255,${0.15 + (i % 5) * 0.1})`
        ctx.fillRect((i * 137.29) % W, sy, i % 3 ? 1 : 2, i % 3 ? 1 : 2)
      }
      ctx.strokeStyle = '#215574'; ctx.lineWidth = 1
      for (let lane = -2; lane <= 2; lane++) {
        ctx.beginPath(); ctx.moveTo(W / 2 + lane * 11, 108); ctx.lineTo(W / 2 + lane * 78, H); ctx.stroke()
      }
      for (let i = 0; i < 9; i++) {
        const d = ((i / 9 + s.ticks * 0.002) % 1)
        const y = 108 + d * d * 412
        ctx.strokeStyle = `rgba(39,132,170,${d * 0.5})`
        ctx.beginPath(); ctx.moveTo(W / 2 - d * 170, y); ctx.lineTo(W / 2 + d * 170, y); ctx.stroke()
      }
      if (running.current && !paused.current) {
        s.ticks += dt
        const speed = 0.009 + Math.min(0.012, s.ticks / 40000)
        const input = steer.current === null ? held.current : Math.max(-1, Math.min(1, (steer.current - W / 2) / 110 - s.x))
        s.x = Math.max(-1.08, Math.min(1.08, s.x + input * dt * 0.045))
        s.spawn += dt
        if (s.spawn > Math.max(19, 47 - s.ticks / 160)) {
          s.spawn = 0
          s.rocks.push({ x: (Math.random() * 2 - 1) * 1.05, z: -1, radius: 12 + Math.random() * 10, spin: Math.random() * 6, energy: Math.random() < 0.25 })
        }
        s.invulnerable = Math.max(0, s.invulnerable - dt)
        for (const r of s.rocks) {
          r.z += speed * dt
          r.spin += 0.018 * dt
          if (!r.hit && r.z > 0.73 && Math.abs(r.x - s.x) < (r.energy ? 0.23 : 0.25)) {
            r.hit = true
            if (r.energy) { s.score += 25; setScore(s.score) }
            else if (!s.invulnerable) {
              s.lives--; setLives(s.lives); s.invulnerable = 65
              if (s.lives <= 0) {
                running.current = false; setPhase('over')
                if (s.score > best) { setBest(s.score); try { localStorage.setItem(KEY, String(s.score)) } catch { /* storage unavailable */ } }
              }
            }
          }
          if (!r.hit && r.z > 1.2) { r.hit = true; if (!r.energy) { s.score += 2; setScore(s.score) } }
        }
        s.rocks = s.rocks.filter(r => r.z < 1.4 && !r.hit)
      }
      // Draw distant objects before nearby objects.
      for (const r of [...s.rocks].sort((a, b) => a.z - b.z)) {
        const p = project(r.x, r.z)
        const size = r.radius * p.scale
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(r.spin)
        if (r.energy) {
          ctx.shadowColor = '#43f5c4'; ctx.shadowBlur = 17 * p.scale
          ctx.fillStyle = '#36e4bc'; ctx.strokeStyle = '#c7fff1'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.8, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.moveTo(-size * 0.8, 0); ctx.lineTo(size * 0.8, 0); ctx.stroke()
        } else {
          const g = ctx.createRadialGradient(-size * .3, -size * .4, 0, 0, 0, size)
          g.addColorStop(0, '#a6b6c6'); g.addColorStop(.6, '#687d91'); g.addColorStop(1, '#2e4359')
          ctx.fillStyle = g; ctx.strokeStyle = '#b0c6d5'; ctx.lineWidth = 1.2
          ctx.beginPath()
          for (let k = 0; k < 11; k++) { const a = k * Math.PI * 2 / 11; const rad = size * (0.83 + Math.sin(k * 11.7) * .15); if (!k) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) }
          ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.fillStyle = '#35495d'; ctx.beginPath(); ctx.ellipse(-size * .2, -size * .13, size * .22, size * .14, .4, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
      }
      const ship = project(s.x, 0.96)
      if (s.invulnerable <= 0 || Math.floor(s.ticks / 5) % 2 === 0) {
        ctx.save(); ctx.translate(ship.x, H - 62)
        ctx.shadowColor = '#29d8ff'; ctx.shadowBlur = 22
        ctx.fillStyle = '#10bde3'; ctx.strokeStyle = '#c8faff'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(20, 20); ctx.lineTo(0, 12); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.shadowBlur = 0; ctx.fillStyle = '#ffa955'; ctx.beginPath(); ctx.moveTo(-7, 18); ctx.lineTo(0, 32 + (s.ticks % 5)); ctx.lineTo(7, 18); ctx.fill(); ctx.restore()
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [best])

  return <main className="mx-auto w-full max-w-lg px-3 pb-8 pt-3">
    <div className="mb-3 flex items-center justify-between gap-3">
      <button type="button" onClick={onClose} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium"><ArrowLeft className="size-4" /> Explore</button>
      <span className="text-sm font-bold">Asteroid Rush</span>
      <button type="button" disabled={phase === 'ready' || phase === 'over'} onClick={togglePause} aria-label={phase === 'paused' ? 'Resume' : 'Pause'} className="grid size-11 place-items-center rounded-xl border border-border disabled:opacity-30">{phase === 'paused' ? <Play className="size-5"/> : <Pause className="size-5"/>}</button>
    </div>
    <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-sky-900 bg-slate-950" style={{ aspectRatio: '360 / 520', touchAction: 'none' }} onPointerDown={e => { if (phase !== 'playing') return; e.currentTarget.setPointerCapture(e.pointerId); steer.current = e.nativeEvent.offsetX / e.currentTarget.clientWidth * W }} onPointerMove={e => { if (phase !== 'playing' || !e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = e.currentTarget.getBoundingClientRect(); steer.current = (e.clientX - rect.left) / rect.width * W }} onPointerUp={() => { steer.current = null }} onPointerCancel={() => { steer.current = null }}>
      <canvas ref={canvas} width={W} height={H} className="block h-full w-full" aria-label="3D perspective asteroid dodging game" />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between text-sm font-bold text-white"><span>Score {score}</span><span className="text-rose-400">{'♥ '.repeat(lives)}</span></div>
      {phase !== 'playing' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/75 px-5 text-center text-white">
        <div className="text-2xl font-extrabold tracking-widest">{phase === 'over' ? 'GAME OVER' : phase === 'paused' ? 'PAUSED' : 'ASTEROID RUSH'}</div>
        <p className="text-sm text-sky-100">{phase === 'ready' ? 'Dodge asteroids. Collect glowing crystals.' : phase === 'over' ? `Final score: ${score}` : 'Take your time.'}</p>
        <div className="flex items-center gap-2 text-sm text-cyan-200"><Trophy className="size-4" /> Best {best}</div>
        <button type="button" onClick={phase === 'paused' ? togglePause : start} className="flex min-h-12 items-center gap-2 rounded-xl bg-cyan-500 px-7 font-bold text-slate-950">{phase === 'over' ? <RotateCcw className="size-5"/> : <Play className="size-5"/>}{phase === 'paused' ? 'Resume' : phase === 'over' ? 'Play Again' : 'Play'}</button>
      </div>}
    </div>
    <div className="mx-auto mt-3 flex max-w-[360px] gap-3">
      <button type="button" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); steer.current = null; held.current = -1 }} onPointerUp={() => { held.current = 0 }} onPointerCancel={() => { held.current = 0 }} className="min-h-14 flex-1 rounded-xl border border-border bg-card text-xl font-bold" aria-label="Move left">◀</button>
      <button type="button" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); steer.current = null; held.current = 1 }} onPointerUp={() => { held.current = 0 }} onPointerCancel={() => { held.current = 0 }} className="min-h-14 flex-1 rounded-xl border border-border bg-card text-xl font-bold" aria-label="Move right">▶</button>
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">Drag to steer or hold the arrows · Offline · No wallet access</p>
  </main>
}
