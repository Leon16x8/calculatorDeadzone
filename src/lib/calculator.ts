import type {
  UserInput,
  DeadzoneResult,
  ResponseCurve,
  DriftIntensity,
  GameplayProfile,
  ControllerPlatform,
  AimAssistMode,
} from '../types';
import { WZ_MAX } from '../types';

// ──────────────────────────────────────────────────
// All output values are on the Warzone 0–99 scale.
//
// Design principles:
//   1. Left stick (movement) tolerates wider deadzone — drift
//      on movement is less harmful than drift on aim.
//   2. Right stick (aiming) must preserve micro-inputs for aim
//      assist interaction: bubble entry, tracking, corrections.
//      Only drift should push right stick min up significantly.
//   3. High sensitivity alone does NOT justify high right stick
//      deadzone — it amplifies intentional micro-inputs too.
//   4. Response curves interact with aim assist: Dynamic/Standard
//      generally pair better than Linear for rotational AA.
// ──────────────────────────────────────────────────

// ── Drift heuristics ─────────────────────────────

// Separate drift offsets per stick: right stick gets a softer
// curve because aggressive drift compensation kills micro-aim.
const LEFT_DRIFT: Record<DriftIntensity, number> = {
  none: 0,
  light: 5,
  medium: 14,
  heavy: 28,
};

const RIGHT_DRIFT: Record<DriftIntensity, number> = {
  none: 0,
  light: 2,
  medium: 8,
  heavy: 20,
};

const PLATFORM_WEAR: Record<ControllerPlatform, number> = {
  'ps5': 0,
  'ps4': 3,
  'xbox-series': 0,
  'xbox-one': 3,
  'pc-controller': 2,
};

// ── Aim assist heuristics ────────────────────────

// Right stick base is intentionally very low to preserve
// the first few ticks of stick travel for aim assist.
// Aim assist mode shifts this base:
//   sticky = slightly higher to filter noise and keep AA locked
//   micro  = as low as possible for raw responsiveness
const RIGHT_BASE: Record<AimAssistMode, number> = {
  sticky: 4,
  balanced: 2,
  micro: 0,
};

// Profile adjusts left stick more than right stick.
// Aggressive wants fast strafe response; precision wants
// stability on movement, but neither should inflate right
// stick deadzone much.
const LEFT_PROFILE: Record<GameplayProfile, number> = {
  aggressive: -3,
  balanced: 0,
  precision: 4,
};

const RIGHT_PROFILE: Record<GameplayProfile, number> = {
  aggressive: -1,
  balanced: 0,
  precision: 2,
};

// ── Sensitivity factor ───────────────────────────

// High sensitivity amplifies ALL stick inputs, including
// intentional micro-inputs used for aim assist tracking.
// Left stick: noticeable scaling (strafe noise is less critical).
// Right stick: minimal scaling — we do NOT want to penalize
// micro-aim just because sensitivity is high.
function leftSensFactor(h: number, v: number): number {
  const avg = (h + v) / 2;
  if (avg <= 4) return -2;
  if (avg <= 7) return 0;
  if (avg <= 12) return 3;
  return 5;
}

function rightSensFactor(h: number, v: number): number {
  const avg = (h + v) / 2;
  if (avg <= 4) return -1;
  if (avg <= 10) return 0;
  return 1;
}

// ── Helpers ──────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rnd(n: number): number {
  return Math.round(n);
}

// Safe lookup: returns fallback if key is missing or value is not a finite number
function lookup<K extends string>(map: Record<K, number>, key: K | undefined, fallback: number): number {
  if (key === undefined || key === null) return fallback;
  const v = map[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Guarantee a value is a finite number, replace NaN/Infinity with fallback
function fin(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

// ── Main calculation ─────────────────────────────

export function calculateDeadzone(input: UserInput): DeadzoneResult {
  const left  = calcLeftStick(input);
  const right = calcRightStick(input);
  const triggers = calcTriggers(input);
  const curve = pickCurve(input);
  const ads   = calcADS(input);
  const ft    = calcFinetune(left, right);

  return {
    ...left,
    ...right,
    ...triggers,
    responseCurve: curve,
    responseCurveReason: curveReason(curve, input),
    ...ads,
    ...ft,
    explanations: buildExplanations(input, left, right, triggers),
  };
}

// ── Left stick (movement) ────────────────────────

function calcLeftStick(input: UserInput) {
  const base = 6;
  const drift = lookup(LEFT_DRIFT, input.leftDrift, 0);
  const hasLeftDrift = input.leftDrift !== 'none';
  const wear = lookup(PLATFORM_WEAR, input.platform, 0);
  const prof = lookup(LEFT_PROFILE, input.gameplayProfile, 0);
  const sens = leftSensFactor(fin(input.sensitivityH, 6), fin(input.sensitivityV, 6));

  const min = clamp(rnd(fin(base + drift + wear + prof + sens)), 0, WZ_MAX);
  const margin = hasLeftDrift ? 6 + rnd(drift * 0.6) : 5;
  const max = clamp(rnd(fin(min + margin)), min + 1, WZ_MAX);

  return { leftStickMin: min, leftStickMax: max };
}

// ── Right stick (aiming — aim-assist-aware) ──────

function calcRightStick(input: UserInput) {
  const base = lookup(RIGHT_BASE, input.aimAssistMode, 2);
  const drift = lookup(RIGHT_DRIFT, input.rightDrift, 0);
  const hasRightDrift = input.rightDrift !== 'none';
  const wear = Math.round(lookup(PLATFORM_WEAR, input.platform, 0) * 0.5);
  const prof = lookup(RIGHT_PROFILE, input.gameplayProfile, 0);
  const sens = rightSensFactor(fin(input.sensitivityH, 6), fin(input.sensitivityV, 6));

  const min = clamp(rnd(fin(base + drift + wear + prof + sens)), 0, WZ_MAX);

  // Max gives room for safety without eating into micro-aim.
  // With no drift, keep the window tight so the stick feels direct.
  const margin = hasRightDrift ? 5 + rnd(drift * 0.5) : 4;
  const max = clamp(rnd(fin(min + margin)), min + 1, WZ_MAX);

  return { rightStickMin: min, rightStickMax: max };
}

// ── Triggers ─────────────────────────────────────

function calcTriggers(input: UserInput) {
  const wear = lookup(PLATFORM_WEAR, input.platform, 0);
  const hasDrift = input.leftDrift !== 'none' || input.rightDrift !== 'none';
  // Use worst drift between both sticks for trigger buffer
  const worstDrift = Math.max(
    lookup(RIGHT_DRIFT, input.leftDrift, 0),
    lookup(RIGHT_DRIFT, input.rightDrift, 0),
  );
  const val = (hasDrift && wear > 0)
    ? clamp(rnd(fin(worstDrift * 0.25)), 0, 10)
    : 0;
  return { leftTrigger: val, rightTrigger: val };
}

// ── Response curve (aim-assist-aware) ────────────

function pickCurve(input: UserInput): ResponseCurve {
  const avg = (fin(input.sensitivityH, 6) + fin(input.sensitivityV, 6)) / 2;

  // Dynamic pairs best with aim assist in close–mid range:
  // it softens micro-inputs while preserving fast flicks.
  if (input.gameplayProfile === 'aggressive') return 'dynamic';

  // Standard is the safest pairing for aim assist in most scenarios.
  if (input.gameplayProfile === 'balanced') {
    return avg >= 10 ? 'dynamic' : 'standard';
  }

  // Precision profile: Standard still works well for aim assist.
  // Linear only for very low sensitivity where the player
  // explicitly wants 1:1 proportional response.
  if (avg <= 4) return 'linear';
  return 'standard';
}

function curveReason(curve: ResponseCurve, input: UserInput): string {
  switch (curve) {
    case 'dynamic':
      return 'Dynamic suaviza micro-inputs e acelera flicks — excelente para aim assist em curta/média distância com estilo agressivo.';
    case 'linear':
      return 'Linear oferece resposta 1:1 proporcional — recomendada apenas com sensibilidade baixa onde previsibilidade total é desejada. Pode dificultar o tracking com aim assist em médias distâncias.';
    case 'reverse-s':
      return 'Reverse S-Curve dá controle fino no centro com aceleração nas extremidades.';
    default:
      return 'Standard é a curva padrão do Warzone — melhor equilíbrio entre controle fino e aim assist rotacional para a maioria dos jogadores.';
  }
}

// ── ADS adjustment (tracking-aware) ──────────────

function calcADS(input: UserInput) {
  const base = fin(input.adsMultiplier, 1.0);
  let delta = 0;
  let reason: string;

  if (base > 1.3) {
    delta = -0.1;
    reason = 'Multiplicador muito alto pode dificultar tracking sustentado — redução sugerida para estabilizar mira em ADS.';
  } else if (base > 1.1) {
    delta = -0.05;
    reason = 'Multiplicador alto: leve redução para manter consistência de tracking sem perder velocidade de snap.';
  } else if (base < 0.75) {
    delta = 0.1;
    reason = 'Multiplicador baixo pode tornar correções lentas demais em ADS — aumento sugerido para melhorar reatividade.';
  } else if (base < 0.9) {
    delta = 0.05;
    reason = 'Multiplicador levemente baixo: pequeno aumento para garantir tracking responsivo dentro da aim assist bubble.';
  } else {
    reason = 'Multiplicador dentro da faixa ideal para tracking e aim assist — sem ajuste necessário.';
  }

  const adsAdjustment = Math.round(clamp(base + delta, 0.5, 2.0) * 100) / 100;
  return { adsAdjustment, adsAdjustmentReason: reason };
}

// ── Fine-tune range ──────────────────────────────

function calcFinetune(
  left: { leftStickMin: number; leftStickMax: number },
  right: { rightStickMin: number; rightStickMax: number },
) {
  const lo = clamp(Math.min(left.leftStickMin, right.rightStickMin) - 2, 0, WZ_MAX);
  const hi = clamp(Math.max(left.leftStickMax, right.rightStickMax) + 3, lo + 1, WZ_MAX);
  return {
    finetuneRange: [lo, hi] as [number, number],
    finetuneReason: 'Faixa segura para experimentação. Comece pelo mínimo recomendado e aumente apenas se perceber drift residual. Para o right stick, priorize o valor mais baixo possível sem ghost input.',
  };
}

// ── Explanations ─────────────────────────────────

function buildExplanations(
  input: UserInput,
  left: { leftStickMin: number; leftStickMax: number },
  right: { rightStickMin: number; rightStickMax: number },
  triggers: { leftTrigger: number; rightTrigger: number },
) {
  const driftLabel = (d: DriftIntensity) =>
    d === 'heavy' ? 'forte' : d === 'medium' ? 'médio' : d === 'light' ? 'leve' : '';
  const leftDriftTag = input.leftDrift !== 'none'
    ? ` Drift ${driftLabel(input.leftDrift)} no stick esquerdo considerado.`
    : '';
  const rightDriftTag = input.rightDrift !== 'none'
    ? ` Drift ${driftLabel(input.rightDrift)} no stick direito considerado.`
    : '';

  const aaTag = input.aimAssistMode === 'sticky'
    ? ' Modo aderência: deadzone ligeiramente maior para filtrar ruído e manter aim assist travado.'
    : input.aimAssistMode === 'micro'
      ? ' Modo microajuste: deadzone mínima para máxima responsividade.'
      : '';

  const isOldController = input.platform === 'ps4' || input.platform === 'xbox-one';

  return {
    leftStickMin: `Deadzone ${left.leftStickMin} no stick de movimento — filtra ruído sem prejudicar resposta de strafe.${leftDriftTag}`,
    leftStickMax: `Teto ${left.leftStickMax} — margem para variação mecânica sem perder fluidez de movimento.`,
    rightStickMin: `Deadzone ${right.rightStickMin} no stick de mira — mantida baixa para preservar micro-inputs e interação com aim assist.${rightDriftTag}${aaTag}`,
    rightStickMax: `Teto ${right.rightStickMax} — permite ajuste sem comprometer tracking em ADS.`,
    leftTrigger: triggers.leftTrigger > 0
      ? `Buffer de ${triggers.leftTrigger} como precaução para controle ${isOldController ? 'mais antigo' : ''} com drift.`
      : 'Zero — gatilhos raramente sofrem drift. Resposta instantânea.',
    rightTrigger: triggers.rightTrigger > 0
      ? `Buffer de ${triggers.rightTrigger} como precaução para controle ${isOldController ? 'mais antigo' : ''} com drift.`
      : 'Zero — gatilhos raramente sofrem drift. Resposta instantânea.',
  };
}
