import { Outlet } from 'react-router-dom'

import { ConnectivityBanner } from '@/features/connectivity/ConnectivityBanner'
import { OfflineBootstrap } from '@/features/connectivity/OfflineBootstrap'
import { AppLayout } from '@/shared/components/AppLayout'

export function AppShell() {
  return (
    <AppLayout>
      <OfflineBootstrap />
      <ConnectivityBanner />
      <Outlet />
    </AppLayout>
  )
}
