import type { TelemetryClient } from '@/services/telemetry/telemetry-client'

export function createNoopTelemetryClient(): TelemetryClient {
  return {
    track() {
      // intentionally empty
    },
    async flush() {
      // intentionally empty
    },
    dispose() {
      // intentionally empty
    },
  }
}
