const KEY = 'numen-app-password-verifier-v1'
const encoder = new TextEncoder()
const hex = (a: Uint8Array) => Array.from(a, n => n.toString(16).padStart(2, '0')).join('')
async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bytes = await crypto.subtle.deriveBits({name:'PBKDF2',salt: salt as BufferSource,iterations,hash:'SHA-256'},key,256)
  return hex(new Uint8Array(bytes))
}
export const hasAppPassword = () => !!localStorage.getItem(KEY)
export async function setAppPassword(password: string) {
  if (hasAppPassword()) throw new Error('Application password already exists.')
  if (password.length < 10) throw new Error('Use at least 10 characters.')
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iterations=310000
  localStorage.setItem(KEY,JSON.stringify({salt:hex(salt),iterations,hash:await derive(password,salt,iterations)}))
}
export async function verifyAppPassword(password: string) {
  try {
    const raw=localStorage.getItem(KEY); if(!raw)return false
    const data=JSON.parse(raw) as {salt:string;iterations:number;hash:string}
    if(!/^[0-9a-f]{32}$/.test(data.salt)||data.iterations<100000)return false
    const salt=Uint8Array.from(data.salt.match(/../g)!,x=>parseInt(x,16))
    const got=await derive(password,salt,data.iterations)
    if(got.length!==data.hash.length)return false
    let diff=0; for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^data.hash.charCodeAt(i)
    return diff===0
  } catch {return false}
}

// Rotate the verifier only after proving knowledge of the current password.
export async function changeAppPassword(current: string, next: string) {
  if (!await verifyAppPassword(current)) throw new Error('Current application password is incorrect.')
  if (next.length < 10) throw new Error('Use at least 10 characters.')
  if (current === next) throw new Error('Choose a different password.')
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iterations = 310000
  localStorage.setItem(KEY, JSON.stringify({salt:hex(salt),iterations,hash:await derive(next,salt,iterations)}))
}
