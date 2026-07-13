/** Retención Dexie metricsLog — local-first, caps estrictos. */
export const METRICS_LOG_MAX_ENTRIES = 450;
export const METRICS_LOG_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
export const METRICS_PRUNE_EVERY_N_WRITES = 20;
export const METRICS_PRUNE_BATCH = 80;

/** Long tasks / freezes (ms). */
export const LONG_TASK_THRESHOLD_MS = 200;

/** Ventanas rolling para contadores en memoria (no persisten cada evento). */
export const ROLLING_WINDOW_5M = 5 * 60 * 1000;
export const ROLLING_WINDOW_10M = 10 * 60 * 1000;

/** Auto-recovery (8A.9 parcial). */
export const AUTO_RECOVERY = {
  longTasksIn5m: 4,
  renderStormsIn5m: 3,
  memoryPressureIn10m: 3,
  fpsDropsIn5m: 6,
  syncTriggersIn1m: 25,
} as const;

/** Health score interno. */
export const HEALTH_THRESHOLDS = {
  memoryCritical: 0.9,
  memoryWarning: 0.75,
  queueCritical: 400,
  queueWarning: 150,
  failedCritical: 25,
  failedWarning: 8,
  longTasksCritical: 5,
  longTasksWarning: 2,
} as const;

/** Siempre persistir (no samplear). */
export const CRITICAL_METRICS = new Set([
  "fatal_boundary_crashed",
  "route_boundary_error",
  "safe_mode_entries",
  "degraded_mode_entries",
  "render_policy_switches",
  "runtime_tier_switches",
  "memory_pressure_ratio",
  "memory_pressure_events",
  "render_storm_events",
  "long_task_ms",
  "ui_freeze_ms",
  "runtime_health_critical",
  "runtime_health_warning",
  "auto_runtime_recovery",
  "recovery_actions",
  "sw_emergency_reset",
  "sync_loop_suspected",
  "auth_snapshot_restored",
  "auth_snapshot_missing",
  "auth_snapshot_corrupted",
  "auth_legacy_migration_success",
  "auth_legacy_migration_failed",
  "auth_phase_transition",
  "auth_refresh_success",
  "auth_refresh_failed",
  "auth_refresh_rejected",
  "auth_refresh_duration_ms",
  "auth_refresh_cooldown_skip",
  "auth_session_revoked",
  "auth_reconnect_required",
  "auth_refresh_lock_wait_ms",
  "auth_refresh_concurrent_prevented",
  "auth_refresh_retry_budget_exceeded",
  "auth_refresh_multitab_sync",
  "auth_refresh_visibility_skip",
  "auth_reconnect_pipeline_start",
  "auth_reconnect_pipeline_success",
  "auth_reconnect_pipeline_failed",
  "auth_sync_gate_denied",
  "auth_sync_gate_allowed",
  "auth_sync_runtime_locked",
  "sync_blocked_auth_phase",
  "reconnect_pipeline_duration_ms",
  "sync_resume_after_refresh_ms",
  "auth_runtime_integrity_check_ms",
  "auth_runtime_revoked",
  "auth_runtime_recovered",
  "auth_runtime_drift_detected",
  "auth_foreground_resume_refresh",
  "auth_session_restore_success",
  "auth_session_restore_failed",
  "auth_locked_duration_ms",
  "boot_to_ready_ms",
  "chaos_auto_disabled",
]);

/** Métricas de profiling — muestreadas cada 5 min (no CRITICAL). */
export const PROFILING_METRICS = new Set([
  "runtime_heap_used_mb",
  "observers_active_count",
  "sync_throughput_per_min",
  "queue_growth_velocity",
  "cache_entries_count",
]);
