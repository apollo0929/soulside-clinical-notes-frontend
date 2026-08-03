import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConnectivityBanner } from '@/features/connectivity/ConnectivityBanner'
import { RealtimeBootstrap } from '@/features/connectivity/RealtimeBootstrap'
import { TelemetryBootstrap } from '@/features/connectivity/TelemetryBootstrap'
import * as mockBackend from '@/services/api/mock-backend-enabled'
import { ConnectivityService } from '@/services/offline/connectivity'
import * as realtimeBootstrap from '@/services/realtime/realtime-bootstrap'
import * as telemetry from '@/services/telemetry'

describe('mock-backend-disabled bootstrap skips', () => {
  it('skips realtime bootstrap when mock backend is disabled', () => {
    vi.spyOn(mockBackend, 'isMockBackendEnabled').mockReturnValue(false)
    const ensure = vi
      .spyOn(realtimeBootstrap, 'ensureRealtimeBootstrap')
      .mockResolvedValue(null as never)
    render(<RealtimeBootstrap />)
    expect(ensure).not.toHaveBeenCalled()
    ensure.mockRestore()
    vi.restoreAllMocks()
  })

  it('skips telemetry bootstrap when mock backend is disabled', () => {
    vi.spyOn(mockBackend, 'isMockBackendEnabled').mockReturnValue(false)
    const ensure = vi.spyOn(telemetry, 'ensureTelemetryBootstrap').mockResolvedValue(null as never)
    const install = vi
      .spyOn(telemetry, 'installDevTelemetryApi')
      .mockImplementation(() => undefined)
    render(<TelemetryBootstrap />)
    expect(ensure).not.toHaveBeenCalled()
    expect(install).not.toHaveBeenCalled()
    ensure.mockRestore()
    install.mockRestore()
    vi.restoreAllMocks()
  })
})

describe('ConnectivityBanner stability', () => {
  it('keeps banner mounted for UNAVAILABLE without remount flicker', () => {
    const service = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    service.start()
    service.markOnline()

    // Banner without active coordinator stays idle (hidden but mounted).
    const { rerender } = render(<ConnectivityBanner connectivity={service} />)
    const node = screen.getByTestId('connectivity-banner')
    expect(node).toHaveAttribute('data-visible', 'false')

    rerender(<ConnectivityBanner connectivity={service} />)
    expect(screen.getByTestId('connectivity-banner')).toBe(node)
    service.stop()
  })
})
