import { postJson } from '@/network/http'
/** Read-only Numen indexer. Never use indexed data to sign or authorize transfers. */
export const NUMEN_GRAPHQL_MAINNET = 'https://graphql.numen-network.org/graphql'
export const NUMEN_GRAPHQL_TESTNET = 'https://testnet.graphql.numen-network.org/graphql'

export class GraphQLRequestError extends Error {
  constructor(message: string) { super(message); this.name = 'GraphQLRequestError' }
}

type GraphQLError = { message: string }
type GraphQLResponse<T> = { data?: T; errors?: GraphQLError[] }

export async function numenGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { endpoint?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const endpoint = options.endpoint ?? NUMEN_GRAPHQL_MAINNET
  const payload = await postJson<GraphQLResponse<T>>(endpoint, { query, variables }, options.signal)
  if (payload.errors?.length) throw new GraphQLRequestError(payload.errors.map(e => e.message).join('; '))
  if (!payload.data) throw new GraphQLRequestError('GraphQL returned no data')
  return payload.data
}

export type IndexerHealth = { __typename: string }
export function checkNumenIndexer(signal?: AbortSignal) {
  return numenGraphQL<IndexerHealth>('query NumenIndexerHealth { __typename }', {}, { signal })
}

/** Discover indexer query field signatures without guessing pagination or schema fields. */
export type IndexedField = { name: string; type: { kind: string; name: string | null; ofType: { kind: string; name: string | null } | null }; args: { name: string; type: { kind: string; name: string | null } }[] }
export async function discover3DQueryFields(signal?: AbortSignal): Promise<IndexedField[]> {
  const result = await numenGraphQL<{ __schema: { queryType: { fields: IndexedField[] } } }>(
    'query Numen3DFields { __schema { queryType { fields { name type { kind name ofType { kind name } } args { name type { kind name } } } } } }', {}, { signal },
  )
  return result.__schema.queryType.fields.filter(field => /minedObjects|meshTopologies|registrars/i.test(field.name))
}
