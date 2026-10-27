import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw, Trophy, ScanLine, CheckCircle2 } from 'lucide-react'

type V = [number, number, number]
type Mesh = { vertices: V[]; faces: number[][] }
const BEST_KEY = 'numen.arcade.shape-lab.best.v1'
const LEVELS = [
  { name: 'Cube', kind: 'cube', yaw: .65, pitch: -.4, tolerance: .28 },
  { name: 'Pyramid', kind: 'pyramid', yaw: -1.05, pitch: .42, tolerance: .26 },
  { name: 'Octahedron', kind: 'octa', yaw: 1.3, pitch: -.5, tolerance: .24 },
  { name: 'Prism', kind: 'prism', yaw: -.7, pitch: -.65, tolerance: .23 },
  { name: 'Crystal', kind: 'crystal', yaw: 1.75, pitch: .45, tolerance: .22 },
  { name: 'Cube', kind: 'cube', yaw: -1.9, pitch: .62, tolerance: .2 },
  { name: 'Prism', kind: 'prism', yaw: 2.3, pitch: -.52, tolerance: .19 },
  { name: 'Crystal', kind: 'crystal', yaw: -2.4, pitch: -.3, tolerance: .18 },
  { name: 'Pyramid', kind: 'pyramid', yaw: 2.65, pitch: .6, tolerance: .17 },
  { name: 'Octahedron', kind: 'octa', yaw: -2.7, pitch: -.58, tolerance: .16 },
] as const
function mesh(kind: string): Mesh {
  if (kind === 'cube') return { vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]], faces: [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]] }
  if (kind === 'pyramid') return { vertices: [[-1,-.8,-1],[1,-.8,-1],[1,-.8,1],[-1,-.8,1],[0,1.3,0]], faces: [[0,3,2,1],[0,1,4],[1,2,4],[2,3,4],[3,0,4]] }
  if (kind === 'octa') return { vertices: [[0,1.4,0],[0,-1.4,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]], faces: [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]] }
  if (kind === 'prism') return { vertices: [[-1,-1,-.8],[1,-1,-.8],[0,1,-.8],[-1,-1,.8],[1,-1,.8],[0,1,.8]], faces: [[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]] }
  return { vertices: [[0,1.5,0],[0,-1.5,0],[-.85,.4,-.85],[.85,.4,-.85],[.85,.4,.85],[-.85,.4,.85],[-.65,-.45,-.65],[.65,-.45,-.65],[.65,-.45,.65],[-.65,-.45,.65]], faces: [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[2,6,7,3],[3,7,8,4],[4,8,9,5],[5,9,6,2],[1,7,6],[1,8,7],[1,9,8],[1,6,9]] }
}
function angleDifference(a: number,b: number) { return Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b))) }
function drawShape(ctx: CanvasRenderingContext2D, m: Mesh, yaw: number, pitch: number, cx: number, cy: number, size: number, target = false) {
  const rotated = m.vertices.map(([x,y,z]) => {
    const x1=x*Math.cos(yaw)+z*Math.sin(yaw), z1=-x*Math.sin(yaw)+z*Math.cos(yaw)
    const y1=y*Math.cos(pitch)-z1*Math.sin(pitch), z2=y*Math.sin(pitch)+z1*Math.cos(pitch)
    const scale=3.9/(4.7-z2*.4)
    return { x:cx+x1*size*scale, y:cy-y1*size*scale, z:z2 }
  })
  const faces=m.faces.map((indices,i)=>({ indices, i, depth:indices.reduce((s,j)=>s+rotated[j].z,0)/indices.length })).sort((a,b)=>a.depth-b.depth)
  ctx.save(); ctx.lineJoin='round'; ctx.lineWidth=target?1.6:2
  faces.forEach(({indices,i,depth})=>{
    ctx.beginPath();indices.forEach((j,k)=>{const p=rotated[j]; if(k===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});ctx.closePath()
    if(target){ctx.fillStyle='rgba(31,175,200,.065)';ctx.strokeStyle='rgba(95,226,247,.8)'}
    else {ctx.fillStyle=`hsla(${192+i*6},78%,${Math.max(21,42+depth*9)}%,.92)`;ctx.strokeStyle='rgba(197,252,255,.92)'}
    ctx.fill();ctx.stroke()
  })
  ctx.restore()
}
export function ShapeLab({ onClose }: { onClose: () => void }) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const pointer=useRef<{x:number;y:number}|null>(null)
  const [level,setLevel]=useState(0)
  const [rotation,setRotation]=useState({yaw:0,pitch:0})
  const [status,setStatus]=useState<'ready'|'success'|'complete'>('ready')
  const [score,setScore]=useState(0)
  const [seconds,setSeconds]=useState(0)
  const [best,setBest]=useState(()=>{try{return Number(localStorage.getItem(BEST_KEY))||0}catch{return 0}})
  const current=LEVELS[level]
  const yawError=angleDifference(rotation.yaw,current.yaw)
  const pitchError=Math.abs(rotation.pitch-current.pitch)
  const accuracy=Math.max(0,Math.round(100*(1-Math.sqrt(yawError*yawError+pitchError*pitchError)/2.5)))
  const aligned=yawError<current.tolerance && pitchError<current.tolerance
  useEffect(()=>{if(status!=='ready')return;const timer=window.setInterval(()=>setSeconds(v=>v+1),1000);return()=>clearInterval(timer)},[status,level])
  useEffect(()=>{const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;const w=360,h=440;c.width=w*devicePixelRatio;c.height=h*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#07182b');bg.addColorStop(1,'#0b3046');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h)
    ctx.strokeStyle='rgba(53,177,210,.13)';ctx.lineWidth=1;for(let x=0;x<w;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    ctx.strokeStyle='rgba(81,229,244,.35)';ctx.beginPath();ctx.ellipse(180,286,130,34,0,0,Math.PI*2);ctx.stroke()
    ctx.fillStyle='#91c7d7';ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.fillText('TARGET GEOMETRY',180,27)
    drawShape(ctx,mesh(current.kind),current.yaw,current.pitch,180,106,52,true)
    ctx.fillStyle='#91c7d7';ctx.fillText('ROTATE OBJECT TO MATCH',180,207)
    ctx.save();ctx.shadowColor='#27c4e4';ctx.shadowBlur=24;drawShape(ctx,mesh(current.kind),rotation.yaw,rotation.pitch,180,314,94);ctx.restore()
    if(status==='success'||status==='complete'){ctx.fillStyle='rgba(7,24,43,.75)';ctx.fillRect(0,0,w,h);ctx.fillStyle='#62efc4';ctx.font='bold 24px sans-serif';ctx.fillText('SCAN COMPLETE',180,220)}
  },[rotation,current,status])
  const scan=useCallback(()=>{if(!aligned||status!=='ready')return;const earned=Math.max(100,600-seconds*12)+(level+1)*50;const next=score+earned;setScore(next);setStatus(level===LEVELS.length-1?'complete':'success');if(next>best){setBest(next);try{localStorage.setItem(BEST_KEY,String(next))}catch{/* storage disabled */}}},[aligned,status,seconds,level,score,best])
  const advance=()=>{if(level===LEVELS.length-1){setLevel(0);setScore(0)}else setLevel(v=>v+1);setRotation({yaw:0,pitch:0});setSeconds(0);setStatus('ready')}
  return <main className="mx-auto w-full max-w-lg px-3 pb-10 pt-3">
    <div className="mb-3 flex items-center justify-between"><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium"><ArrowLeft className="size-5"/> Explore</button><span className="text-sm font-bold">Numen Shape Lab</span><span className="text-xs text-muted-foreground">Offline</span></div>
    <div className="mb-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted p-2"><div className="text-[10px] text-muted-foreground">LEVEL</div><div className="font-bold">{level+1}/10</div></div><div className="rounded-xl bg-muted p-2"><div className="text-[10px] text-muted-foreground">SCORE</div><div className="font-bold">{score}</div></div><div className="rounded-xl bg-muted p-2"><div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground"><Trophy className="size-3"/> BEST</div><div className="font-bold">{best}</div></div></div>
    <div className="overflow-hidden rounded-2xl border border-cyan-800/40 bg-[#07182b]"><div className="flex justify-between px-4 pt-3 text-xs text-cyan-100"><span>{current.name}</span><span>{seconds}s · {accuracy}% match</span></div>
      <canvas ref={canvas} className="w-full touch-none" style={{aspectRatio:'360 / 440'}} aria-label="Interactive three dimensional shape" onPointerDown={e=>{if(status!=='ready')return;pointer.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!pointer.current||status!=='ready')return;const dx=e.clientX-pointer.current.x,dy=e.clientY-pointer.current.y;pointer.current={x:e.clientX,y:e.clientY};setRotation(r=>({yaw:r.yaw+dx*.013,pitch:Math.max(-1.3,Math.min(1.3,r.pitch+dy*.013))}))}} onPointerUp={()=>{pointer.current=null}} onPointerCancel={()=>{pointer.current=null}} />
      <div className="px-4 pb-4"><div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{width:`${accuracy}%`}}/></div>
      {status==='ready'?<div className="flex gap-2"><button type="button" onClick={()=>setRotation({yaw:0,pitch:0})} className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-cyan-800 px-3 text-sm text-cyan-100"><RotateCcw className="size-4"/> Reset</button><button type="button" onClick={scan} disabled={!aligned} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><ScanLine className="size-5"/>{aligned?'Scan Object':'Align to Scan'}</button></div>:<button type="button" onClick={advance} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 font-semibold text-slate-950"><CheckCircle2 className="size-5"/>{status==='complete'?'Play Again':'Next Shape'}</button>}
      </div></div>
    <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Drag to rotate the lower 3D object until it matches the reference above. This is a geometry puzzle inspired by Numen, not an actual Proof of Scan verification or on-chain registration.</p>
  </main>
}
