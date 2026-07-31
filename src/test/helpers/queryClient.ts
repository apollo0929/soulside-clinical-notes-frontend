import { QueryClient } from '@tanstack/react-query'

const activeQueryClients = new Set<QueryClient>()

export function createTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  registerTestQueryClient(queryClient)
  return queryClient
}

export function registerTestQueryClient(queryClient: QueryClient): QueryClient {
  activeQueryClients.add(queryClient)
  return queryClient
}

export function clearTestQueryClients(): void {
  for (const queryClient of activeQueryClients) {
    void queryClient.cancelQueries()
    queryClient.clear()
  }

  activeQueryClients.clear()
}
