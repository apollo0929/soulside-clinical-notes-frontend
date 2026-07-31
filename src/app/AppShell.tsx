import { AppRoutes } from '@/app/routes'
import { AppLayout } from '@/shared/components/AppLayout'

export function AppShell() {
  return (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  )
}
