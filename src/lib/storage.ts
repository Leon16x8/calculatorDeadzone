import type { UserInput, SavedPreset, DeadzoneResult } from '../types';
import { DEFAULT_INPUT } from '../types';
import { calculateDeadzone } from './calculator';
import {
  sanitizeInput,
  sanitizeResult,
  sanitizePreset,
  inputFingerprint,
  needsMigration,
  setStorageVersion,
} from './sanitize';

const KEYS = {
  LAST_INPUT: 'wz-dz-last-input',
  LAST_RESULT: 'wz-dz-last-result',
  LAST_FINGERPRINT: 'wz-dz-last-fp',
  PRESETS: 'wz-dz-presets',
} as const;

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// ── Public API ───────────────────────────────────

export function loadLastInput(): UserInput {
  const raw = readRaw(KEYS.LAST_INPUT);
  if (!raw) return { ...DEFAULT_INPUT };
  return sanitizeInput(raw);
}

export function saveLastInput(input: UserInput): void {
  write(KEYS.LAST_INPUT, input);
}

export function loadLastResult(): DeadzoneResult | null {
  const raw = readRaw(KEYS.LAST_RESULT);
  return sanitizeResult(raw);
}

export function saveLastResult(result: DeadzoneResult, input: UserInput): void {
  write(KEYS.LAST_RESULT, result);
  writeString(KEYS.LAST_FINGERPRINT, inputFingerprint(input));
}

export function isResultFresh(input: UserInput): boolean {
  const savedFp = readString(KEYS.LAST_FINGERPRINT);
  if (!savedFp) return false;
  return savedFp === inputFingerprint(input);
}

export function loadPresets(): SavedPreset[] {
  const raw = readRaw(KEYS.PRESETS);
  if (!Array.isArray(raw)) return [];

  const cleaned: SavedPreset[] = [];
  for (const item of raw) {
    const preset = sanitizePreset(item);
    if (!preset) continue;
    // Recalculate to ensure result matches current calculator version
    // (cheap — max 20 presets, pure math)
    preset.result = calculateDeadzone(preset.input);
    cleaned.push(preset);
  }
  return cleaned;
}

export function savePreset(preset: SavedPreset): void {
  const presets = loadPresets();
  presets.unshift(preset);
  if (presets.length > 20) presets.length = 20;
  write(KEYS.PRESETS, presets);
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter((p) => p.id !== id);
  write(KEYS.PRESETS, presets);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Migration ────────────────────────────────────

export function migrateStorageIfNeeded(): void {
  if (!needsMigration()) return;

  const input = loadLastInput();
  saveLastInput(input);

  const result = calculateDeadzone(input);
  saveLastResult(result, input);

  const rawPresets = readRaw(KEYS.PRESETS);
  if (Array.isArray(rawPresets)) {
    const migrated = loadPresets();
    write(KEYS.PRESETS, migrated);
  }

  setStorageVersion();
}
