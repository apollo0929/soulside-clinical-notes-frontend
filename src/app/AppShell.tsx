import { Outlet } from 'react-router-dom'

import { AppLayout } from '@/shared/components/AppLayout'

export function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
