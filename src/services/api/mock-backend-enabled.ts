/**
 * Shared DEV mock-backend enablement.
 * Single source of truth for MSW / mock-dependent service bootstrap.
 *
 * TEMPORARY DIAGNOSTIC: set to `false` to disable MSW + mock-dependent realtime/telemetry.
 * Restore to `true` (or `git restore` this file) after diagnosis.
 */
const ENABLE_MSW_FOR_DIAGNOSIS = true

/**
 * Whether the in-browser mock backend (MSW) is enabled for this session.
 * - DEV + flag false → mock APIs unavailable; skip MSW/realtime/telemetry loops.
 * - DEV + flag true → MSW owns /api/*.
 * - Production builds → treated as enabled (real backend; do not skip services).
 */
export function isMockBackendEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return true
  }
  return ENABLE_MSW_FOR_DIAGNOSIS
}

/** @internal Test helper — mirrors the diagnostic flag in DEV. */
export function getMockBackendDiagnosticFlagForTests(): boolean {
  return ENABLE_MSW_FOR_DIAGNOSIS
}
