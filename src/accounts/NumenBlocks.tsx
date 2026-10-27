import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Save, Trash2, Undo2, Redo2 } from 'lucide-react'

type Block = { x: number; y: number; z: number; color: string }
type Point = { x: number; y: number; z: number }
const STORE = 'numen.arcade.blocks.scene.v1'
const PALETTE = ['#69b95e', '#916447', '#929ba5', '#bd8950', '#398d55', '#e6d08c']
const MATERIALS = [{name:'Grass',color:'#69b95e'},{name:'Dirt',color:'#916447'},{name:'Stone',color:'#929ba5'},{name:'Wood',color:'#bd8950'},{name:'Leaves',color:'#398d55'},{name:'Sand',color:'#e6d08c'},{name:'Water',color:'#4eaddc'},{name:'Brick',color:'#b65d55'},{name:'Glass',color:'#a0e6e8'},{name:'White',color:'#e4e8ed'},{name:'Dark',color:'#4e576b'},{name:'Gold',color:'#f4d16e'}]
const INITIAL: Block[] = []
const VERTICES: Point[] = [{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:1,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:1,y:0,z:1},{x:1,y:1,z:1},{x:0,y:1,z:1}]
const FACES = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
const faceOffset: Point[] = [{x:0,y:0,z:-1},{x:0,y:0,z:1},{x:0,y:-1,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:-1,y:0,z:0}]
type NativeModelSaver = { save(options:{filename:string;content:string}):Promise<{uri:string}> }
const NativeModelSave = registerPlugin<NativeModelSaver>('NumenModelSave')
function toObj(blocks:Block[]):string {
  const lines=['# Numen Blocks voxel model', '# Units: 1 voxel = 1 unit']
  const occupied=new Set(blocks.map(b=>`${b.x},${b.y},${b.z}`))
  let vertex=1
  const faces:[number,number,number][][]=[
    [[0,0,0],[0,1,0],[0,1,1],[0,0,1]],
    [[1,0,0],[1,0,1],[1,1,1],[1,1,0]],
    [[0,0,0],[0,0,1],[1,0,1],[1,0,0]],
    [[0,1,0],[1,1,0],[1,1,1],[0,1,1]],
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0]],
    [[0,0,1],[0,1,1],[1,1,1],[1,0,1]],
  ]
  const neighbors=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]]
  blocks.forEach(b=>{
    neighbors.forEach(([dx,dy,dz],i)=>{
      if(occupied.has(`${b.x+dx},${b.y+dy},${b.z+dz}`))return
      for(const [x,y,z] of faces[i])lines.push(`v ${b.x+x} ${b.y+y} ${b.z+z}`)
      lines.push(`f ${vertex} ${vertex+1} ${vertex+2} ${vertex+3}`)
      vertex+=4
    })
  })
  return lines.join('\n')+'\n'
}
function makeWorld(kind:'island'|'house'|'tree'): Block[] {
  const out:Block[]=[]; const add=(x:number,y:number,z:number,color:string)=>out.push({x,y,z,color})
  for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){add(x,y,0,'#916447');add(x,y,1,'#69b95e')}
  if(kind==='house'){for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++){if(Math.abs(x)===2||Math.abs(y)===2){if(!(y===-2&&x===0))for(let z=2;z<=4;z++)add(x,y,z,'#bd8950')} }for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)add(x,y,5,'#b65d55');add(-1,-2,3,'#a0e6e8');add(1,-2,3,'#a0e6e8')}
  if(kind==='tree'){for(let z=2;z<=5;z++)add(0,0,z,'#bd8950');for(let z=5;z<=7;z++)for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)if(Math.abs(x)+Math.abs(y)+(z===7?1:0)<=3)add(x,y,z,'#398d55')}
  return out
}
type TemplateCategory = 'People' | 'Animals' | 'Plants' | 'Vehicles' | 'Buildings' | 'Nature'
type Template = { id:string; name:string; category:TemplateCategory; emoji:string }
const TEMPLATES:Template[] = [
  {id:'person',name:'Person',category:'People',emoji:'🧍'},
  {id:'robot',name:'Robot',category:'People',emoji:'🤖'},
  {id:'cat',name:'Cat',category:'Animals',emoji:'🐈'},
  {id:'dog',name:'Dog',category:'Animals',emoji:'🐕'},
  {id:'bird',name:'Bird',category:'Animals',emoji:'🐦'},
  {id:'fish',name:'Fish',category:'Animals',emoji:'🐟'},
  {id:'flower',name:'Flower',category:'Plants',emoji:'🌻'},
  {id:'cactus',name:'Cactus',category:'Plants',emoji:'🌵'},
  {id:'pine',name:'Pine Tree',category:'Plants',emoji:'🌲'},
  {id:'tree',name:'Oak Tree',category:'Plants',emoji:'🌳'},
  {id:'car',name:'Car',category:'Vehicles',emoji:'🚗'},
  {id:'rocket',name:'Rocket',category:'Vehicles',emoji:'🚀'},
  {id:'house',name:'House',category:'Buildings',emoji:'🏠'},
  {id:'castle',name:'Castle',category:'Buildings',emoji:'🏰'},
  {id:'mountain',name:'Mountain',category:'Nature',emoji:'⛰️'},
  {id:'island',name:'Island',category:'Nature',emoji:'🏝️'},
]
const CATEGORIES:('All'|TemplateCategory)[]=['All','People','Animals','Plants','Vehicles','Buildings','Nature']
function makeTemplate(id:string):Block[]{
  if(id==='island'||id==='house'||id==='tree')return makeWorld(id)
  const out:Block[]=[];const used=new Set<string>()
  const put=(x:number,y:number,z:number,color:string)=>{const k=`${x},${y},${z}`;if(z<0||used.has(k))return;used.add(k);out.push({x,y,z,color})}
  const box=(x1:number,x2:number,y1:number,y2:number,z1:number,z2:number,c:string)=>{for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)for(let z=z1;z<=z2;z++)put(x,y,z,c)}
  const brown='#916447',green='#398d55',skin='#e5b58c',white='#e4e8ed',dark='#4e576b',red='#b65d55',blue='#4eaddc',gold='#f4d16e'
  switch(id){
    case 'person':case 'robot':{
      const body=id==='robot'?'#929ba5':'#4eaddc',face=id==='robot'?'#a0e6e8':skin
      box(-1,-1,0,0,0,2,dark);box(1,1,0,0,0,2,dark);box(-1,1,0,0,3,6,body)
      box(-2,-2,0,0,4,6,body);box(2,2,0,0,4,6,body)
      box(-1,1,0,0,7,9,face);put(-1,-1,8,dark);put(1,-1,8,dark)
      if(id==='robot'){put(0,0,10,gold);put(0,-1,5,gold)}else box(-1,1,0,0,10,10,brown)
      break
    }
    case 'cat':case 'dog':{
      box(-2,2,-1,1,2,4,id==='cat'?'#929ba5':brown)
      for(const x of [-2,2])for(const y of [-1,1])box(x,x,y,y,0,1,id==='cat'?'#929ba5':brown)
      box(-3,-2,-1,1,4,6,id==='cat'?'#929ba5':brown)
      put(-3,-1,7,id==='cat'?'#929ba5':brown);put(-3,1,7,id==='cat'?'#929ba5':brown)
      put(-3,-2,5,white);put(-3,2,5,white)
      if(id==='cat')for(let z=4;z<=7;z++)put(3,0,z,'#929ba5')
      else{put(-4,0,4,dark);put(3,0,5,brown);put(4,0,6,brown)}
      break
    }
    case 'bird':{
      box(-1,1,0,0,2,4,blue);box(-3,-2,0,0,3,3,white);box(2,3,0,0,3,3,white)
      put(0,0,5,blue);put(0,-1,5,gold);put(-1,0,1,gold);put(1,0,1,gold)
      break
    }
    case 'fish':{
      box(-2,2,0,0,2,4,blue);box(3,4,0,0,1,2,gold);box(3,4,0,0,4,5,gold)
      put(-2,-1,3,dark);put(0,0,5,blue);put(0,0,1,blue);break
    }
    case 'flower':{
      box(0,0,0,0,0,6,green);for(const [x,z] of [[-1,7],[1,7],[0,8],[0,6],[-1,8],[1,8]])put(x,0,z,red)
      put(0,-1,7,gold);put(-1,0,3,green);put(1,0,4,green);break
    }
    case 'cactus':{
      box(0,0,0,0,0,8,green);box(-2,-2,0,0,3,6,green);put(-1,0,3,green)
      box(2,2,0,0,4,7,green);put(1,0,4,green);break
    }
    case 'pine':{
      box(0,0,0,0,0,3,brown)
      for(let z=3;z<=10;z++){const r=Math.max(0,Math.floor((10-z)/2));for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)put(x,y,z,green)}break
    }
    case 'car':{
      box(-3,3,-1,1,1,2,red);box(-1,1,-1,1,3,4,blue)
      for(const x of [-2,2])for(const y of [-2,2])box(x,x,y,y,0,1,dark)
      put(-3,-2,2,gold);put(-3,2,2,gold);break
    }
    case 'rocket':{
      box(-1,1,-1,1,2,8,white);box(0,0,0,0,9,11,red)
      for(const x of [-2,2])box(x,x,0,0,0,4,red)
      for(const y of [-2,2])box(0,0,y,y,0,4,red)
      put(0,-2,6,blue);put(0,0,1,gold);break
    }
    case 'castle':{
      box(-3,3,-3,3,0,4,'#929ba5')
      for(const x of [-3,3])for(const y of [-3,3]){box(x,x,y,y,5,7,'#929ba5');put(x,y,8,red)}
      for(let z=0;z<=2;z++)put(0,-3,z,brown)
      break
    }
    case 'mountain':{
      for(let z=0;z<=7;z++){const r=7-z;for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)if(Math.abs(x)+Math.abs(y)<=r+2)put(x,y,z,z>4?white:'#929ba5')}break
    }
  }
  return out
}
// Numen Blocks uses only individual editable cubes.
function shapeStamp(base:Point, color:string):Block[] {
  return [{x:base.x,y:base.y,z:base.z,color}]
}
const clamp = (n:number, min:number,max:number)=>Math.min(max,Math.max(min,n))
const key = (b:Point)=>`${b.x},${b.y},${b.z}`
export function NumenBlocks({onClose}:{onClose:()=>void}) {
  const [blocks,setBlocks]=useState<Block[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');return Array.isArray(saved)&&saved.length<=1200&&saved.every((b:Block)=>Number.isInteger(b.x)&&Number.isInteger(b.y)&&Number.isInteger(b.z)&&typeof b.color==='string')?saved:INITIAL}catch{return INITIAL}})
  const [libraryOpen,setLibraryOpen]=useState(false)
  const [toolsOpen,setToolsOpen]=useState(false)
  const [category,setCategory]=useState<'All'|TemplateCategory>('All');const [color,setColor]=useState(MATERIALS[0].color);const [mode,setMode]=useState<'build'|'paint'|'erase'|'clone'>('build')
  const [message,setMessage]=useState('Tap the empty workspace to place your first cube. Drag to rotate.');const [azimuth,setAzimuth]=useState(-0.65);const [elevation,setElevation]=useState(0.52);const [zoom,setZoom]=useState(1)
  const canvas=useRef<HTMLCanvasElement>(null);const regions=useRef<{poly:{x:number;y:number}[]; block:Block; face:number;depth:number}[]>([])
  const drag=useRef<{x:number;y:number;moving:boolean;az:number;el:number}|null>(null)
  const history=useRef<Block[][]>([]);const future=useRef<Block[][]>([])
  useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify(blocks))}catch{}},[blocks])
  const change=(next:Block[])=>{future.current=[];history.current.push(blocks);if(history.current.length>30)history.current.shift();setBlocks(next)}
  const render=useCallback(()=>{
    const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return
    const rect=c.getBoundingClientRect();const w=Math.max(1,rect.width),h=Math.max(1,rect.height);const dpr=Math.min(2,window.devicePixelRatio||1)
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h)
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#18344d');bg.addColorStop(.65,'#326378');bg.addColorStop(1,'#183e47');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h)
    const xs=blocks.map(b=>b.x),ys=blocks.map(b=>b.y),zs=blocks.map(b=>b.z)
    const cx=(Math.min(0,...xs)+Math.max(1,...xs.map(x=>x+1)))/2,cy=(Math.min(0,...ys)+Math.max(1,...ys.map(y=>y+1)))/2,cz=(Math.min(0,...zs)+Math.max(1,...zs.map(z=>z+1)))/2
    const span=Math.max(5,...xs.map(x=>Math.abs(x-cx)*2+2),...ys.map(y=>Math.abs(y-cy)*2+2),...zs.map(z=>Math.abs(z-cz)*2+2))
    const scale=Math.min(w,h)*.66/span*zoom
    const co=Math.cos(azimuth),si=Math.sin(azimuth),ce=Math.cos(elevation),se=Math.sin(elevation)
    function project(p:Point){const x=p.x-cx,y=p.y-cy,z=p.z-cz;const rx=x*co-y*si,ry=x*si+y*co;return {x:w/2+rx*scale,y:h/2+(ry*se-z*ce)*scale,depth:ry*ce+z*se}}
    // Grid floor
    ctx.strokeStyle='#2e5a6b';ctx.lineWidth=.6
    for(let i=-5;i<=5;i++){const a=project({x:i,y:-5,z:-.03}),b=project({x:i,y:5,z:-.03}),d=project({x:-5,y:i,z:-.03}),e=project({x:5,y:i,z:-.03});ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(d.x,d.y);ctx.lineTo(e.x,e.y);ctx.stroke()}
    const occupied=new Set(blocks.map(key));const all:{poly:{x:number;y:number}[];block:Block;face:number;depth:number}[]=[]
    blocks.forEach(b=>FACES.forEach((face,fi)=>{const o=faceOffset[fi];if(occupied.has(key({x:b.x+o.x,y:b.y+o.y,z:b.z+o.z})))return
      const pts=face.map(vi=>{const v=VERTICES[vi];return project({x:b.x+v.x,y:b.y+v.y,z:b.z+v.z})})
      const cross=(pts[1].x-pts[0].x)*(pts[2].y-pts[0].y)-(pts[1].y-pts[0].y)*(pts[2].x-pts[0].x)
      if(cross<=0)return
      all.push({poly:pts,block:b,face:fi,depth:pts.reduce((s,p)=>s+p.depth,0)/4})
    }))
    all.sort((a,b)=>a.depth-b.depth)
    all.forEach(({poly,block,face})=>{ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=block.color;ctx.fill();ctx.fillStyle=['#00000035','#ffffff20','#00000025','#00000015','#ffffff0b','#00000030'][face];ctx.fill();ctx.strokeStyle='#091827b5';ctx.lineWidth=1.25;ctx.stroke()})
    regions.current=all
    ctx.fillStyle='#9ac8d4';ctx.font='11px system-ui';ctx.fillText(`${blocks.length} blocks`,12,h-14)
  },[blocks,azimuth,elevation,zoom])
  useEffect(()=>{render();const obs=new ResizeObserver(render);if(canvas.current)obs.observe(canvas.current);return()=>obs.disconnect()},[render])
  const pointer=(e:React.PointerEvent<HTMLCanvasElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{const p=pointer(e);drag.current={...p,moving:false,az:azimuth,el:elevation};e.currentTarget.setPointerCapture(e.pointerId)}
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!drag.current)return;const p=pointer(e),d=drag.current;if(Math.hypot(p.x-d.x,p.y-d.y)>7)d.moving=true;if(d.moving){setAzimuth(d.az+(p.x-d.x)*.012);setElevation(clamp(d.el+(p.y-d.y)*.009,-1.3,1.3))}}
  const up=(e:React.PointerEvent<HTMLCanvasElement>)=>{const d=drag.current;drag.current=null;if(!d||d.moving)return;const p=pointer(e)
    function inside(poly:{x:number;y:number}[]){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit}return hit}
    const hit=[...regions.current].reverse().find(r=>inside(r.poly));if(!hit){if(blocks.length===0&&mode==='build'){change([{x:0,y:0,z:0,color}]);setMessage('First cube placed. Tap a cube face to keep building.')}else setMessage(blocks.length===0?'Select Build and tap the workspace to add a cube.':'Tap a visible block face to build.');return}
    if(mode==='erase'){const remaining=blocks.filter(b=>key(b)!==key(hit.block));change(remaining);return}
    if(mode==='paint'){change(blocks.map(b=>key(b)===key(hit.block)?{...b,color}:b));return}
    if(mode==='clone'){setColor(hit.block.color);setMode('build');setMessage('Material copied. Tap a face to place it.');return}
    const o=faceOffset[hit.face],base={x:hit.block.x+o.x,y:hit.block.y+o.y,z:hit.block.z+o.z}
    const occupied=new Set(blocks.map(key))
    const additions=shapeStamp(base,color).filter(b=>!occupied.has(key(b)))
    if(additions.some(b=>Math.abs(b.x)>15||Math.abs(b.y)>15||b.z<0||b.z>15)){setMessage('Shape does not fit in the build area.');return}
    if(blocks.length+additions.length>500){setMessage('Maximum 500 blocks per model.');return}
    if(additions.length)change([...blocks,...additions])
    else setMessage('This space is already filled.')
  }
  const [saving,setSaving]=useState(false)
  const saveModel = async () => {
    if(saving)return
    try { localStorage.setItem(STORE,JSON.stringify(blocks)) }
    catch { setMessage('Could not save the editable model in app storage.');return }
        setSaving(true)
    try {
      const filename=`NumenBlocks_${new Date().toISOString().replace(/[:.]/g,'-')}.obj`
      const content=toObj(blocks)
      if(Capacitor.isNativePlatform()) {
        await NativeModelSave.save({filename,content})
        setMessage('OBJ file saved to your chosen folder. Editable model also saved in the app.')
      } else {
        const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
        const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove()
        setTimeout(()=>URL.revokeObjectURL(url),30000)
        setMessage('OBJ download started. Editable model also saved in the app.')
      }
    } catch(e) {
      if(String(e).includes('SAVE_CANCELLED'))setMessage('File saving cancelled. Editable model remains saved in the app.')
      else setMessage('OBJ could not be saved: '+(e instanceof Error?e.message:String(e)))
    } finally {setSaving(false)}
  }
  return <main className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4 text-foreground">
    <div className="mb-3 flex items-center justify-between gap-2"><button onClick={onClose} className="inline-flex min-h-11 items-center gap-2 text-sm"><ArrowLeft className="size-5"/> 3D Verify</button><strong>Numen Blocks</strong><span className="text-xs text-muted-foreground">Offline</span></div>
    <div className="mb-3 rounded-2xl border border-border bg-card p-3"><h1 className="font-semibold">Create anything with 3D blocks</h1><p className="mt-1 text-xs text-muted-foreground">Create people, animals, plants, vehicles and buildings from editable voxel templates. Drag to orbit, tap to build, save your creation on this device.</p></div>
    <div className="overflow-hidden rounded-2xl border border-cyan-900/30"><canvas ref={canvas} className="block h-[360px] w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>drag.current=null} aria-label="Interactive 3D block building canvas" /></div>
    <section className="mt-3 rounded-2xl border border-border bg-card p-3">
      <button type="button" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(v=>!v)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left"><span className="text-sm font-semibold">Build Tools & Materials</span>{toolsOpen?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}</button>
      {toolsOpen && <div className="pt-2">
    <div className="mt-3 flex gap-2">{(['build','paint','erase','clone'] as const).map(m=><button key={m} onClick={()=>{setMode(m);setMessage(m==='build'?(blocks.length===0?'Tap the workspace to place your first cube.':'Tap a face to add a block.'):m==='paint'?'Tap a block to recolor it.':m==='clone'?'Tap a block to copy its material.':'Tap a block to remove it.')}} className={`min-h-11 flex-1 rounded-xl border px-2 text-sm font-semibold capitalize ${mode===m?'border-cyan-500 bg-cyan-500/15 text-cyan-600':'border-border bg-card'}`}>{m}</button>)}</div>
    <div className="mt-3 grid grid-cols-6 gap-2">{MATERIALS.map(m=><button key={m.name} onClick={()=>{setColor(m.color);setMode('build')}} title={m.name} aria-label={`Select ${m.name}`} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg border bg-card text-[9px] ${color===m.color?'border-cyan-500 ring-1 ring-cyan-500':'border-border'}`}><span className="h-6 w-7 rounded-sm border border-black/10" style={{background:m.color}}/>{m.name}</button>)}</div>
    <div className="mt-3 flex items-center gap-2"><button onClick={()=>setZoom(z=>clamp(z*.8,.45,2.5))} className="min-h-10 flex-1 rounded-lg border border-border bg-card text-sm">− Zoom</button><button onClick={()=>setZoom(z=>clamp(z*1.25,.45,2.5))} className="min-h-10 flex-1 rounded-lg border border-border bg-card text-sm">+ Zoom</button><button onClick={()=>{setAzimuth(-.65);setElevation(.52);setZoom(1)}} className="min-h-10 rounded-lg border border-border bg-card px-3 text-sm"><RotateCcw className="size-4"/></button></div>
    </div>}
    </section>
    <section className="mb-3 mt-3 rounded-2xl border border-border bg-card p-3">
      <button type="button" aria-expanded={libraryOpen} onClick={()=>setLibraryOpen(v=>!v)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left"><span className="text-sm font-semibold">3D Model Library <span className="ml-1 text-[11px] font-normal text-muted-foreground">16 templates</span></span>{libraryOpen?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}</button>
      {libraryOpen && <div className="pt-2">
      <p className="mb-3 text-xs text-muted-foreground">Choose a person, animal, plant, vehicle or building. Every model is made of editable voxel blocks.</p>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{CATEGORIES.map(c=><button key={c} onClick={()=>setCategory(c)} className={`min-h-9 shrink-0 rounded-lg border px-3 text-xs ${category===c?'border-cyan-500 bg-cyan-500/15 font-semibold':'border-border'}`}>{c}</button>)}</div>
      <div className="grid grid-cols-4 gap-2">{TEMPLATES.filter(t=>category==='All'||t.category===category).map(t=><button key={t.id} onClick={()=>{if(blocks.length>1&&!window.confirm(`Load ${t.name}? Your current design will be replaced (Undo can restore it).`))return;change(makeTemplate(t.id));setZoom(1);setMessage(`${t.name} loaded. Customize it with blocks and save your model.`)}} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background px-1 text-center"><span className="text-2xl" aria-hidden="true">{t.emoji}</span><span className="text-[10px] font-medium leading-tight">{t.name}</span></button>)}</div>
      <button onClick={()=>{if(blocks.length>0&&!window.confirm('Start an empty design? Your current design will be replaced.'))return;change(INITIAL);setMessage('Empty workspace ready. Tap to place your first cube.')}} className="mt-3 min-h-10 w-full rounded-lg border border-border text-xs font-semibold">+ Start with an empty workspace</button>
      </div>}
    </section>
    <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>{const prev=history.current.pop();if(prev){future.current.push(blocks);setBlocks(prev)}}} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm"><Undo2 className="size-4"/> Undo</button><button onClick={()=>{const next=future.current.pop();if(next){history.current.push(blocks);setBlocks(next)}}} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm"><Redo2 className="size-4"/> Redo</button><button onClick={()=>{if(window.confirm('Clear all blocks and start empty?'))change(INITIAL)}} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-3" aria-label="Clear model"><Trash2 className="size-4"/></button></div>
    <button onClick={saveModel} disabled={saving} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 font-semibold text-white"><Save className="size-5"/> {saving ? "Choose a folder…" : "Save Model (.OBJ)"}</button>
    <p role="status" className="mt-3 text-center text-xs text-muted-foreground">{message}</p><p className="mt-2 text-center text-[11px] text-muted-foreground">Save Model opens Android file picker: select Downloads, then Save · No wallet access</p>
  </main>
}
