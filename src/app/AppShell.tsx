import { Outlet } from 'react-router-dom'

import { ConnectivityBanner } from '@/features/connectivity/ConnectivityBanner'
import { OfflineBootstrap } from '@/features/connectivity/OfflineBootstrap'
import { RealtimeBootstrap } from '@/features/connectivity/RealtimeBootstrap'
import { TelemetryBootstrap } from '@/features/connectivity/TelemetryBootstrap'
import { AppLayout } from '@/shared/components/AppLayout'

export function AppShell() {
  return (
    <AppLayout>
      <OfflineBootstrap />
      <RealtimeBootstrap />
      <TelemetryBootstrap />
      <ConnectivityBanner />
      <Outlet />
    </AppLayout>
  )
}
