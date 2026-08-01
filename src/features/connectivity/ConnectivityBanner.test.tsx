import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConnectivityBanner } from '@/features/connectivity/ConnectivityBanner'
import { ConnectivityService } from '@/services/offline/connectivity'

describe('ConnectivityBanner', () => {
  it('73–77: shows offline message, queue count, and Retry for failures', () => {
    const service = new ConnectivityService({
      getNavigatorOnline: () => false,
      addWindowListener: () => () => undefined,
    })
    service.start()
    service.markOffline()
    service.setQueueSummary({ queued: 2, conflicts: 0, failed: 0 })

    const { rerender } = render(<ConnectivityBanner connectivity={service} />)

    expect(screen.getByTestId('connectivity-banner')).toBeInTheDocument()
    expect(screen.getByText(/Offline — changes will be saved on this device/i)).toBeInTheDocument()
    expect(screen.getByTestId('connectivity-queue-count')).toHaveTextContent('Queue: 2')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')

    service.setQueueSummary({ queued: 2, conflicts: 0, failed: 1 })
    rerender(<ConnectivityBanner connectivity={service} />)
    expect(screen.getByRole('button', { name: /Retry failed sync/i })).toBeInTheDocument()
    service.stop()
  })

  it('76: conflict count reflected in banner copy', () => {
    const service = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    service.markDegraded('1 change requires conflict resolution.')
    service.setQueueSummary({ queued: 0, conflicts: 1, failed: 0 })
    render(<ConnectivityBanner connectivity={service} />)
    expect(screen.getByText(/require conflict resolution/i)).toBeInTheDocument()
  })
})
