import { useEffect, useState } from 'react'
import { checkNumenIndexer, discover3DQueryFields } from './client'

type Status = { state: 'loading' | 'ready' | 'error'; message: string; fields: string[] }

/** Read-only status; registry creation and verification are not yet implemented. */
export function IndexerStatus({ section }: { section: 'registry' | 'verify' }) {
  const [status, setStatus] = useState<Status>({ state: 'loading', message: 'Connecting to Numen GraphQL…', fields: [] })
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        await checkNumenIndexer(controller.signal)
        let fields: string[] = []
        try { fields = (await discover3DQueryFields(controller.signal)).map(f => f.name) } catch { /* schema introspection may be disabled */ }
        if (!controller.signal.aborted) setStatus({ state: 'ready', message: 'GraphQL indexer connected (read-only)', fields })
      } catch (error) {
        if (!controller.signal.aborted) setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Indexer unavailable', fields: [] })
      }
    }
    void check()
    return () => controller.abort()
  }, [])
  return (
    <div className="mt-6 rounded-xl border border-border bg-muted/30 p-3 text-left text-xs" role="status">
      <p className="font-semibold">Numen GraphQL · {status.state === 'ready' ? 'Connected' : status.state === 'loading' ? 'Connecting' : 'Unavailable'}</p>
      <p className="mt-1 break-words text-muted-foreground">{status.message}</p>
      {status.fields.length > 0 && <p className="mt-2 text-muted-foreground">3D-related indexer queries: {status.fields.join(', ')}</p>}
      <p className="mt-2 text-muted-foreground">{section === 'registry' ? 'Object registration requires a future transaction workflow.' : '3D verification requires a defined record lookup and validation workflow.'}</p>
    </div>
  )
}
