import type { RealtimeServer } from '@/mock/realtime/realtime-server'

let activeServer: RealtimeServer | null = null

export function registerActiveMockRealtimeServer(server: RealtimeServer): void {
  activeServer = server
}

export function getActiveMockRealtimeServer(): RealtimeServer | null {
  return activeServer
}

export function resetActiveMockRealtimeServerForTests(): void {
  activeServer?.clearForTests()
  activeServer = null
}
