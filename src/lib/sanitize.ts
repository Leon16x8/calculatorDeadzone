import type { UserInput, DeadzoneResult, SavedPreset, DriftIntensity } from '../types';
import { DEFAULT_INPUT, WZ_MAX } from '../types';

// v4: per-stick drift (leftDrift, rightDrift) replaces global hasDrift+driftIntensity
const STORAGE_VERSION = 4;
const VERSION_KEY = 'wz-dz-version';

// ── Primitive guards ─────────────────────────────

export function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function safeNum(v: unknown, fallback: number, min?: number, max?: number): number {
  const n = isFiniteNum(v) ? v : fallback;
  if (min !== undefined && max !== undefined) return Math.max(min, Math.min(max, n));
  return n;
}

export function safeInt(v: unknown, fallback: number, min = 0, max = WZ_MAX): number {
  return Math.round(safeNum(v, fallback, min, max));
}

function safeEnum<T extends string>(v: unknown, valid: readonly T[], fallback: T): T {
  return valid.includes(v as T) ? (v as T) : fallback;
}

// ── UserInput sanitization ───────────────────────

const PLATFORMS = ['ps5', 'ps4', 'xbox-series', 'xbox-one', 'pc-controller'] as const;
const DRIFTS = ['none', 'light', 'medium', 'heavy'] as const;
const PROFILES = ['aggressive', 'balanced', 'precision'] as const;
const AA_MODES = ['sticky', 'balanced', 'micro'] as const;

export function sanitizeInput(raw: unknown): UserInput {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_INPUT };
  const r = raw as Record<string, unknown>;

  // ── Per-stick drift (v4) with migration from v3 global drift ──
  //
  // Migration policy: if old format (hasDrift + driftIntensity) is found,
  // apply the same global drift value to both sticks. This preserves
  // the user's previous intention without data loss.
  let leftDrift: DriftIntensity;
  let rightDrift: DriftIntensity;

  if ('leftDrift' in r || 'rightDrift' in r) {
    // New per-stick format
    leftDrift = safeEnum(r.leftDrift, DRIFTS, 'none');
    rightDrift = safeEnum(r.rightDrift, DRIFTS, 'none');
  } else {
    // Old global format → migrate to both sticks
    const hadDrift = typeof r.hasDrift === 'boolean' ? r.hasDrift : false;
    const oldDrift = safeEnum(r.driftIntensity, DRIFTS, 'none');
    const migrated = hadDrift ? (oldDrift === 'none' ? 'light' : oldDrift) : 'none';
    leftDrift = migrated;
    rightDrift = migrated;
  }

  return {
    sensitivityH: safeNum(r.sensitivityH, DEFAULT_INPUT.sensitivityH, 1, 20),
    sensitivityV: safeNum(r.sensitivityV, DEFAULT_INPUT.sensitivityV, 1, 20),
    adsMultiplier: safeNum(r.adsMultiplier, DEFAULT_INPUT.adsMultiplier, 0.5, 2.0),
    platform: safeEnum(r.platform, PLATFORMS, DEFAULT_INPUT.platform),
    leftDrift,
    rightDrift,
    gameplayProfile: safeEnum(r.gameplayProfile, PROFILES, DEFAULT_INPUT.gameplayProfile),
    aimAssistMode: safeEnum(r.aimAssistMode, AA_MODES, DEFAULT_INPUT.aimAssistMode),
  };
}

// ── Input fingerprint ────────────────────────────
// Deterministic string that changes whenever the input changes.
// Used to detect stale results without deep-comparing objects.

export function inputFingerprint(input: UserInput): string {
  return [
    input.sensitivityH,
    input.sensitivityV,
    input.adsMultiplier,
    input.platform,
    input.leftDrift,
    input.rightDrift,
    input.gameplayProfile,
    input.aimAssistMode,
  ].join('|');
}

// ── DeadzoneResult validation ────────────────────

const CURVES = ['standard', 'linear', 'dynamic', 'reverse-s'] as const;

export function sanitizeResult(raw: unknown): DeadzoneResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Required numeric fields
  const leftStickMin  = safeInt(r.leftStickMin, -1);
  const leftStickMax  = safeInt(r.leftStickMax, -1);
  const rightStickMin = safeInt(r.rightStickMin, -1);
  const rightStickMax = safeInt(r.rightStickMax, -1);
  const leftTrigger   = safeInt(r.leftTrigger, -1, 0, 10);
  const rightTrigger  = safeInt(r.rightTrigger, -1, 0, 10);

  // Structural coherence: min must be <= max
  if (leftStickMin < 0 || leftStickMax < 0 || leftStickMin > leftStickMax) return null;
  if (rightStickMin < 0 || rightStickMax < 0 || rightStickMin > rightStickMax) return null;
  if (leftTrigger < 0 || rightTrigger < 0) return null;

  // ADS
  const adsAdjustment = safeNum(r.adsAdjustment, -1, 0.5, 2.0);
  if (adsAdjustment < 0.5) return null;

  // Finetune range
  if (!Array.isArray(r.finetuneRange) || r.finetuneRange.length < 2) return null;
  const ft0 = safeInt(r.finetuneRange[0], -1);
  const ft1 = safeInt(r.finetuneRange[1], -1);
  if (ft0 < 0 || ft1 < 0 || ft0 > ft1) return null;

  // Enum fields
  const responseCurve = safeEnum(r.responseCurve, CURVES, null as unknown as typeof CURVES[number]);
  if (!responseCurve) return null;

  // String fields
  if (typeof r.responseCurveReason !== 'string' || !r.responseCurveReason) return null;
  if (typeof r.adsAdjustmentReason !== 'string' || !r.adsAdjustmentReason) return null;
  if (typeof r.finetuneReason !== 'string' || !r.finetuneReason) return null;

  // Explanations object
  const expl = r.explanations;
  if (!expl || typeof expl !== 'object') return null;
  const e = expl as Record<string, unknown>;
  const explKeys = ['leftStickMin', 'leftStickMax', 'rightStickMin', 'rightStickMax', 'leftTrigger', 'rightTrigger'];
  for (const k of explKeys) {
    if (typeof e[k] !== 'string') return null;
  }

  return {
    leftStickMin,
    leftStickMax,
    rightStickMin,
    rightStickMax,
    leftTrigger,
    rightTrigger,
    responseCurve,
    responseCurveReason: r.responseCurveReason as string,
    adsAdjustment,
    adsAdjustmentReason: r.adsAdjustmentReason as string,
    finetuneRange: [ft0, ft1],
    finetuneReason: r.finetuneReason as string,
    explanations: expl as DeadzoneResult['explanations'],
  };
}

// ── SavedPreset sanitization ─────────────────────

export function sanitizePreset(raw: unknown): SavedPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.name !== 'string' || !r.name) return null;
  if (!isFiniteNum(r.createdAt)) return null;

  const input = sanitizeInput(r.input);
  return {
    id: r.id,
    name: r.name,
    input,
    result: null as unknown as DeadzoneResult, // placeholder — caller must recalculate
    createdAt: r.createdAt,
  };
}

// ── Storage version migration ────────────────────

export function getStorageVersion(): number {
  try {
    const v = localStorage.getItem(VERSION_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setStorageVersion(): void {
  try {
    localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
  } catch {}
}

export function needsMigration(): boolean {
  return getStorageVersion() < STORAGE_VERSION;
}
