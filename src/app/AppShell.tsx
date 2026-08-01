import { Outlet } from 'react-router-dom'

import { ConnectivityBanner } from '@/features/connectivity/ConnectivityBanner'
import { OfflineBootstrap } from '@/features/connectivity/OfflineBootstrap'
import { RealtimeBootstrap } from '@/features/connectivity/RealtimeBootstrap'
import { AppLayout } from '@/shared/components/AppLayout'

export function AppShell() {
  return (
    <AppLayout>
      <OfflineBootstrap />
      <RealtimeBootstrap />
      <ConnectivityBanner />
      <Outlet />
    </AppLayout>
  )
}
