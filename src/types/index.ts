export type ControllerPlatform = 'ps5' | 'ps4' | 'xbox-series' | 'xbox-one' | 'pc-controller';

export type DriftIntensity = 'none' | 'light' | 'medium' | 'heavy';

export type GameplayProfile = 'aggressive' | 'balanced' | 'precision';

export type AimAssistMode = 'sticky' | 'balanced' | 'micro';

export type ResponseCurve = 'standard' | 'linear' | 'dynamic' | 'reverse-s';

export interface UserInput {
  sensitivityH: number;
  sensitivityV: number;
  adsMultiplier: number;
  platform: ControllerPlatform;
  // Per-stick drift — calibração e formulário definem cada stick independentemente.
  // Migração v3→v4: antigo hasDrift+driftIntensity global → ambos sticks recebem o valor antigo.
  leftDrift: DriftIntensity;
  rightDrift: DriftIntensity;
  gameplayProfile: GameplayProfile;
  aimAssistMode: AimAssistMode;
}

export interface DeadzoneResult {
  leftStickMin: number;
  leftStickMax: number;
  rightStickMin: number;
  rightStickMax: number;
  leftTrigger: number;
  rightTrigger: number;
  responseCurve: ResponseCurve;
  responseCurveReason: string;
  adsAdjustment: number;
  adsAdjustmentReason: string;
  finetuneRange: [number, number];
  finetuneReason: string;
  explanations: RecommendationExplanations;
}

export interface RecommendationExplanations {
  leftStickMin: string;
  leftStickMax: string;
  rightStickMin: string;
  rightStickMax: string;
  leftTrigger: string;
  rightTrigger: string;
}

export interface SavedPreset {
  id: string;
  name: string;
  input: UserInput;
  result: DeadzoneResult;
  createdAt: number;
}

export interface AppState {
  currentInput: UserInput;
  lastResult: DeadzoneResult | null;
  presets: SavedPreset[];
}

export const WZ_MAX = 99;

export const DEFAULT_INPUT: UserInput = {
  sensitivityH: 6,
  sensitivityV: 6,
  adsMultiplier: 1.0,
  platform: 'ps5',
  leftDrift: 'none',
  rightDrift: 'none',
  gameplayProfile: 'balanced',
  aimAssistMode: 'balanced',
};

export const PLATFORM_LABELS: Record<ControllerPlatform, string> = {
  'ps5': 'PlayStation 5',
  'ps4': 'PlayStation 4',
  'xbox-series': 'Xbox Series X|S',
  'xbox-one': 'Xbox One',
  'pc-controller': 'PC (Controle)',
};

export const DRIFT_LABELS: Record<DriftIntensity, string> = {
  'none': 'Nenhum',
  'light': 'Leve',
  'medium': 'Médio',
  'heavy': 'Forte',
};

export const PROFILE_LABELS: Record<GameplayProfile, string> = {
  'aggressive': 'Agressivo',
  'balanced': 'Equilibrado',
  'precision': 'Precisão',
};

export const AIM_ASSIST_LABELS: Record<AimAssistMode, string> = {
  'sticky': 'Mais Aderência',
  'balanced': 'Equilibrado',
  'micro': 'Mais Microajuste',
};

export const AIM_ASSIST_HINTS: Record<AimAssistMode, string> = {
  'sticky': 'Prioriza retenção do aim assist — deadzone filtra ruído para manter o "grude"',
  'balanced': 'Equilíbrio entre aderência do aim assist e liberdade de correção manual',
  'micro': 'Prioriza controle fino — deadzone mínima para máxima responsividade do stick de mira',
};

export const CURVE_LABELS: Record<ResponseCurve, string> = {
  'standard': 'Standard',
  'linear': 'Linear',
  'dynamic': 'Dynamic',
  'reverse-s': 'Reverse S-Curve',
};
