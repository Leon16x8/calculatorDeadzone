import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { UserInput, DriftIntensity } from '../types';
import { DRIFT_LABELS, WZ_MAX } from '../types';
import { calculateDeadzone } from '../lib/calculator';

interface Props {
  input: UserInput;
  onApplyCalibration?: (stick: 'left' | 'right', driftIntensity: DriftIntensity) => void;
}

interface StickReading {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

type ActiveStick = 'left' | 'right';

// ── Calibration types & constants ────────────────

type CalibrationState = 'idle' | 'countdown' | 'sampling' | 'done' | 'error';

interface CalibrationResult {
  average: number;
  peak: number;
  p95: number;        // percentil 95 — robusto contra outliers
  sampleCount: number;
  classification: DriftIntensity;
}

// Duração de cada fase (ms)
const COUNTDOWN_SECONDS = 3;
const SAMPLING_DURATION_MS = 3000;
// Taxa de amostragem: ~60Hz via rAF, coletamos a cada frame

// ── Heurística de classificação de drift ─────────
//
// Baseada no percentil 95 da magnitude do stick em repouso.
// Valores normalizados 0–1 (eixo da Gamepad API).
//
// Thresholds pragmáticos:
//   < 0.02  → none   (ruído normal de ADC, sem drift perceptível)
//   < 0.06  → light  (drift sutil, visível mas não problemático)
//   < 0.15  → medium (drift claro, causa ghost input em jogo)
//   >= 0.15 → heavy  (drift forte, stick claramente defeituoso)
//
// Ajuste esses valores se os controles testados mostrarem
// limiares diferentes. O p95 foi escolhido por ignorar
// picos pontuais (outliers) mas capturar drift persistente.
const DRIFT_THRESHOLDS: { max: number; label: DriftIntensity }[] = [
  { max: 0.02, label: 'none' },
  { max: 0.06, label: 'light' },
  { max: 0.15, label: 'medium' },
];
// Acima do último threshold → 'heavy'

function classifyDrift(p95: number): DriftIntensity {
  for (const t of DRIFT_THRESHOLDS) {
    if (p95 < t.max) return t.label;
  }
  return 'heavy';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function analyzeSamples(samples: number[]): CalibrationResult {
  if (samples.length === 0) {
    return { average: 0, peak: 0, p95: 0, sampleCount: 0, classification: 'none' };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const average = sum / sorted.length;
  const peak = sorted[sorted.length - 1];
  const p95 = percentile(sorted, 95);
  return {
    average,
    peak,
    p95,
    sampleCount: sorted.length,
    classification: classifyDrift(p95),
  };
}

const CLASSIFICATION_LABELS: Record<DriftIntensity, string> = {
  none: 'Nenhum drift detectado',
  light: 'Drift leve detectado',
  medium: 'Drift médio detectado',
  heavy: 'Drift forte detectado',
};

const CLASSIFICATION_COLORS: Record<DriftIntensity, string> = {
  none: 'var(--success)',
  light: 'var(--warning)',
  medium: 'var(--danger)',
  heavy: 'var(--danger)',
};

export default function DriftSimulator({ input, onApplyCalibration }: Props) {
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState('');
  const [stickData, setStickData] = useState<StickReading>({ lx: 0, ly: 0, rx: 0, ry: 0 });
  const [activeStick, setActiveStick] = useState<ActiveStick>('right');
  const [peakDrift, setPeakDrift] = useState(0);
  const [simDriftOverride, setSimDriftOverride] = useState<DriftIntensity | null>(null);
  const rafRef = useRef<number>(0);
  // Refs for stable rAF callback — avoids recreating pollGamepad on every state change
  const activeStickRef = useRef<ActiveStick>('right');
  const gamepadConnectedRef = useRef(false);
  const peakDriftRef = useRef(0);

  // ── Calibration state ──────────────────────────
  const [calState, setCalState] = useState<CalibrationState>('idle');
  const [calCountdown, setCalCountdown] = useState(0);
  const [calResult, setCalResult] = useState<CalibrationResult | null>(null);
  const calSamplesRef = useRef<number[]>([]);
  const calTimerRef = useRef<number>(0);
  // Stick congelado no início da calibração — todo o fluxo usa este valor,
  // não o activeStick da UI que pode mudar depois.
  const calStickRef = useRef<ActiveStick>('right');

  // Use actual form input, with optional drift override for the active stick
  const effectiveInput = useMemo<UserInput>(() => {
    if (simDriftOverride === null) return input;
    if (activeStick === 'left') {
      return { ...input, leftDrift: simDriftOverride };
    }
    return { ...input, rightDrift: simDriftOverride };
  }, [input, simDriftOverride, activeStick]);

  const result = useMemo(() => calculateDeadzone(effectiveInput), [effectiveInput]);

  // Keep refs in sync with state so pollGamepad stays stable
  useEffect(() => { activeStickRef.current = activeStick; }, [activeStick]);

  const pollGamepad = useCallback(() => {
    const gamepads = navigator.getGamepads();
    let found = false;

    for (const gp of gamepads) {
      if (!gp) continue;
      found = true;
      if (!gamepadConnectedRef.current) {
        gamepadConnectedRef.current = true;
        setGamepadConnected(true);
        setGamepadName(gp.id);
      }

      const lx = gp.axes[0] ?? 0;
      const ly = gp.axes[1] ?? 0;
      const rx = gp.axes[2] ?? 0;
      const ry = gp.axes[3] ?? 0;

      // Only update state if stick data actually changed
      setStickData((prev) => {
        if (prev.lx === lx && prev.ly === ly && prev.rx === rx && prev.ry === ry) return prev;
        return { lx, ly, rx, ry };
      });

      const stick = activeStickRef.current;
      const mag = stick === 'left'
        ? Math.sqrt(lx * lx + ly * ly)
        : Math.sqrt(rx * rx + ry * ry);
      // Only update peak if it actually increased
      if (mag > peakDriftRef.current) {
        peakDriftRef.current = mag;
        setPeakDrift(mag);
      }
      break;
    }

    if (!found && gamepadConnectedRef.current) {
      gamepadConnectedRef.current = false;
      setGamepadConnected(false);
      setGamepadName('');
      setStickData({ lx: 0, ly: 0, rx: 0, ry: 0 });
    }

    rafRef.current = requestAnimationFrame(pollGamepad);
  }, []); // Stable — no dependencies, uses refs

  useEffect(() => {
    rafRef.current = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pollGamepad]);

  useEffect(() => {
    const onDisconnect = () => {
      setGamepadConnected(false);
      setGamepadName('');
    };
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => window.removeEventListener('gamepaddisconnected', onDisconnect);
  }, []);

  const resetPeak = () => { peakDriftRef.current = 0; setPeakDrift(0); };

  // ── Calibration logic ──────────────────────────

  const startCalibration = useCallback(() => {
    if (!gamepadConnected) {
      setCalState('error');
      return;
    }
    // Congela o stick alvo — todo o fluxo usa calStickRef a partir daqui
    calStickRef.current = activeStick;
    setCalResult(null);
    calSamplesRef.current = [];
    setCalCountdown(COUNTDOWN_SECONDS);
    setCalState('countdown');

    let remaining = COUNTDOWN_SECONDS;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(calTimerRef.current);
        beginSampling();
        return;
      }
      setCalCountdown(remaining);
    };
    calTimerRef.current = window.setInterval(tick, 1000);
  }, [gamepadConnected, activeStick]);

  const beginSampling = useCallback(() => {
    setCalState('sampling');
    calSamplesRef.current = [];
    const startTime = performance.now();
    // Captura o stick congelado para uso dentro do loop de rAF
    const stick = calStickRef.current;

    const sampleLoop = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= SAMPLING_DURATION_MS) {
        finishSampling();
        return;
      }

      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        const x = stick === 'left' ? (gp.axes[0] ?? 0) : (gp.axes[2] ?? 0);
        const y = stick === 'left' ? (gp.axes[1] ?? 0) : (gp.axes[3] ?? 0);
        const mag = Math.sqrt(x * x + y * y);
        if (mag <= 0.5) {
          calSamplesRef.current.push(mag);
        }
        break;
      }

      calTimerRef.current = requestAnimationFrame(sampleLoop);
    };
    calTimerRef.current = requestAnimationFrame(sampleLoop);
  }, []);

  const finishSampling = useCallback(() => {
    const samples = calSamplesRef.current;
    if (samples.length < 10) {
      setCalState('error');
      return;
    }
    const result = analyzeSamples(samples);
    setCalResult(result);
    setCalState('done');
  }, []);

  const cancelCalibration = useCallback(() => {
    clearInterval(calTimerRef.current);
    cancelAnimationFrame(calTimerRef.current);
    setCalState('idle');
    setCalResult(null);
    calSamplesRef.current = [];
  }, []);

  const applyCalibration = useCallback(() => {
    if (!calResult || !onApplyCalibration) return;
    onApplyCalibration(calStickRef.current, calResult.classification);
    setCalState('idle');
  }, [calResult, onApplyCalibration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(calTimerRef.current);
      cancelAnimationFrame(calTimerRef.current);
    };
  }, []);

  const calIsActive = calState === 'countdown' || calState === 'sampling';

  const canvasSize = 240;
  const center = canvasSize / 2;
  const outerR = canvasSize / 2 - 8;

  const dzMin = activeStick === 'left' ? result.leftStickMin : result.rightStickMin;
  const dzMax = activeStick === 'left' ? result.leftStickMax : result.rightStickMax;
  const dzRadius = (dzMin / WZ_MAX) * outerR;
  const dzMaxRadius = (dzMax / WZ_MAX) * outerR;

  const sx = activeStick === 'left' ? stickData.lx : stickData.rx;
  const sy = activeStick === 'left' ? stickData.ly : stickData.ry;
  const stickMag = Math.min(Math.sqrt(sx * sx + sy * sy), 1);
  const stickPxX = center + sx * outerR;
  const stickPxY = center + sy * outerR;

  const driftOffsets: Record<DriftIntensity, number> = {
    none: 0,
    light: 0.05,
    medium: 0.12,
    heavy: 0.25,
  };
  const inputDriftForStick = activeStick === 'left' ? input.leftDrift : input.rightDrift;
  const activeDrift = simDriftOverride ?? inputDriftForStick;
  const simDriftR = driftOffsets[activeDrift] * outerR;
  const simDriftAngle = -0.4;
  const simDriftX = center + Math.cos(simDriftAngle) * simDriftR;
  const simDriftY = center + Math.sin(simDriftAngle) * simDriftR;

  const liveMagScaled = Math.round(stickMag * WZ_MAX);
  const liveInsideDZ = liveMagScaled <= dzMin;
  const simInsideDZ = simDriftR <= dzRadius;

  const peakScaled = Math.round(peakDrift * WZ_MAX);
  const showSimDot = activeDrift !== 'none';

  return (
    <div className="drift-sim">
      <div className="card-title">
        <span className="icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        Simulador de Drift
      </div>

      <div className={`gamepad-status ${gamepadConnected ? 'connected' : ''}`}>
        <div className={`gamepad-status-dot ${gamepadConnected ? 'on' : ''}`} />
        <span>
          {gamepadConnected
            ? gamepadName.slice(0, 45)
            : 'Nenhum controle detectado — conecte e pressione um botão'}
        </span>
      </div>

      <div className="sim-controls">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Stick Ativo</label>
          <div className="chip-group">
            <button
              type="button"
              className={`chip ${activeStick === 'left' ? 'active' : ''}`}
              onClick={() => { setActiveStick('left'); resetPeak(); }}
              disabled={calIsActive}
            >
              Esquerdo
            </button>
            <button
              type="button"
              className={`chip ${activeStick === 'right' ? 'active' : ''}`}
              onClick={() => { setActiveStick('right'); resetPeak(); }}
              disabled={calIsActive}
            >
              Direito
            </button>
          </div>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">Simular Drift</label>
          <div className="chip-group">
            {(['none', 'light', 'medium', 'heavy'] as DriftIntensity[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`chip ${(simDriftOverride ?? inputDriftForStick) === level ? 'active' : ''}`}
                onClick={() => setSimDriftOverride(level === inputDriftForStick ? null : level)}
                disabled={calIsActive}
              >
                {DRIFT_LABELS[level]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="form-hint" style={{ marginBottom: 12 }}>
        Usando sua configuração atual (Sens {input.sensitivityH}/{input.sensitivityV}, {input.gameplayProfile}, AA {input.aimAssistMode})
        {simDriftOverride !== null && simDriftOverride !== inputDriftForStick && ' — drift sobrescrito para simulação'}
      </p>

      <div className="drift-canvas-wrap">
        <div className="drift-canvas" style={{ width: canvasSize, height: canvasSize }}>
          <div className="drift-ring outer" style={{ width: outerR * 2, height: outerR * 2 }} />
          <div
            className="drift-ring outer"
            style={{
              width: dzMaxRadius * 2,
              height: dzMaxRadius * 2,
              borderStyle: 'dashed',
              borderColor: 'rgba(99, 102, 241, 0.25)',
            }}
          />
          <div className="drift-ring deadzone" style={{ width: dzRadius * 2, height: dzRadius * 2 }} />

          {showSimDot && (
            <>
              <div
                className="drift-ring drift-area"
                style={{ width: simDriftR * 2 + 16, height: simDriftR * 2 + 16 }}
              />
              <div
                className="drift-dot sim"
                style={{
                  left: simDriftX - 5,
                  top: simDriftY - 5,
                  background: simInsideDZ ? 'var(--success)' : 'var(--danger)',
                  boxShadow: simInsideDZ
                    ? '0 0 10px rgba(52, 211, 153, 0.6)'
                    : '0 0 10px rgba(248, 113, 113, 0.6)',
                  opacity: 0.7,
                }}
              />
            </>
          )}

          <div className="drift-crosshair-h" />
          <div className="drift-crosshair-v" />
          <div className="drift-center" />

          {gamepadConnected && (
            <div
              className="drift-dot live"
              style={{
                left: stickPxX - 6,
                top: stickPxY - 6,
                width: 12,
                height: 12,
                background: liveInsideDZ ? 'var(--warning)' : 'var(--text-primary)',
                boxShadow: liveInsideDZ
                  ? '0 0 12px rgba(251, 191, 36, 0.7)'
                  : '0 0 12px rgba(255, 255, 255, 0.4)',
              }}
            />
          )}
        </div>

        {gamepadConnected && (
          <div className="drift-readout">
            <div className="drift-readout-row">
              <span className="drift-readout-label">X</span>
              <span className="drift-readout-val mono">{sx.toFixed(3)}</span>
            </div>
            <div className="drift-readout-row">
              <span className="drift-readout-label">Y</span>
              <span className="drift-readout-val mono">{sy.toFixed(3)}</span>
            </div>
            <div className="drift-readout-row">
              <span className="drift-readout-label">Mag</span>
              <span className="drift-readout-val mono">{(stickMag * 100).toFixed(1)}%</span>
            </div>
            <div className="drift-readout-divider" />
            <div className="drift-readout-row">
              <span className="drift-readout-label">Pico</span>
              <span className="drift-readout-val mono highlight">{peakScaled}</span>
            </div>
            <div className="drift-readout-row">
              <span className="drift-readout-label">DZ Mín</span>
              <span className="drift-readout-val mono">{dzMin}</span>
            </div>
            <div className="drift-readout-row">
              <span className="drift-readout-label">Status</span>
              <span className={`drift-readout-val mono ${liveInsideDZ ? 'status-ok' : 'status-warn'}`}>
                {liveInsideDZ ? 'FILTRADO' : 'ATIVO'}
              </span>
            </div>
            <button className="btn-secondary" style={{ marginTop: 8, width: '100%', fontSize: '0.7rem' }} onClick={resetPeak}>
              Resetar Pico
            </button>
          </div>
        )}
      </div>

      <div className="drift-legend">
        <div className="drift-legend-item">
          <div className="drift-legend-dot" style={{ background: 'var(--accent)', opacity: 0.6 }} />
          DZ Mín ({dzMin})
        </div>
        <div className="drift-legend-item">
          <div className="drift-legend-dot" style={{ border: '1px dashed var(--accent)', opacity: 0.4 }} />
          DZ Máx ({dzMax})
        </div>
        {gamepadConnected && (
          <div className="drift-legend-item">
            <div className="drift-legend-dot" style={{ background: 'var(--warning)' }} />
            Stick ao vivo
          </div>
        )}
        {showSimDot && (
          <div className="drift-legend-item">
            <div className="drift-legend-dot" style={{ background: simInsideDZ ? 'var(--success)' : 'var(--danger)' }} />
            Drift simulado
          </div>
        )}
      </div>

      <div className="drift-helper-text">
        {!gamepadConnected && !showSimDot && (
          <p>Conecte um controle ou selecione um nível de drift para simular o impacto na sua configuração atual.</p>
        )}
        {!gamepadConnected && showSimDot && simInsideDZ && (
          <p>A deadzone recomendada para o {activeStick === 'right' ? 'stick de mira' : 'stick de movimento'} filtra o drift neste nível.</p>
        )}
        {!gamepadConnected && showSimDot && !simInsideDZ && (
          <p>O drift excede a deadzone mínima. Considere aumentar ou usar o valor máximo recomendado.</p>
        )}
        {gamepadConnected && liveInsideDZ && (
          <p>Stick dentro da deadzone — micro-drift filtrado. {activeStick === 'right' ? 'Aim assist preservado.' : ''}</p>
        )}
        {gamepadConnected && !liveInsideDZ && (
          <p>Stick fora da deadzone — input ativo. Solte o stick para medir drift em repouso.</p>
        )}
      </div>

      {/* ── Calibração automática ────────────────── */}
      <div className="cal-section">
        <div className="cal-header">
          <span className="cal-title">Calibração Automática</span>
          {calState === 'idle' && (
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 18px', fontSize: '0.78rem' }}
              onClick={startCalibration}
              disabled={calIsActive}
            >
              Calibrar automaticamente
            </button>
          )}
          {calIsActive && (
            <button
              className="btn-secondary"
              style={{ fontSize: '0.72rem' }}
              onClick={cancelCalibration}
            >
              Cancelar
            </button>
          )}
        </div>

        {calState === 'idle' && !calResult && (
          <p className="cal-hint">
            Mede o drift real do stick {activeStick === 'right' ? 'direito' : 'esquerdo'} em repouso e sugere a configuração ideal.
          </p>
        )}

        {calState === 'error' && (
          <div className="cal-message cal-error fade-in">
            <strong>Erro:</strong>{' '}
            {!gamepadConnected
              ? 'Nenhum controle conectado. Conecte um controle e tente novamente.'
              : 'Não foi possível coletar amostras suficientes. Tente novamente sem tocar no stick.'}
            <button
              className="btn-secondary"
              style={{ marginTop: 8, fontSize: '0.72rem' }}
              onClick={() => setCalState('idle')}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {calState === 'countdown' && (
          <div className="cal-message cal-countdown fade-in">
            <div className="cal-countdown-number">{calCountdown}</div>
            <p>Solte o controle e não toque no stick {calStickRef.current === 'right' ? 'direito' : 'esquerdo'}.</p>
            <p className="cal-hint-small">A coleta do stick {calStickRef.current === 'right' ? 'direito' : 'esquerdo'} iniciará automaticamente...</p>
          </div>
        )}

        {calState === 'sampling' && (
          <div className="cal-message cal-sampling fade-in">
            <div className="cal-pulse-ring" />
            <p>Coletando amostras do stick {calStickRef.current === 'right' ? 'direito' : 'esquerdo'}...</p>
            <p className="cal-hint-small">Não toque no controle</p>
          </div>
        )}

        {calState === 'done' && calResult && (
          <div className="cal-result fade-in">
            <div className="cal-result-header">
              <span className="cal-result-stick-tag">Stick {calStickRef.current === 'right' ? 'direito' : 'esquerdo'}</span>
              <span
                className="cal-result-badge"
                style={{ background: CLASSIFICATION_COLORS[calResult.classification] }}
              >
                {CLASSIFICATION_LABELS[calResult.classification]}
              </span>
            </div>
            <div className="cal-result-stats">
              <div className="cal-stat">
                <span className="cal-stat-label">Média</span>
                <span className="cal-stat-value mono">{(calResult.average * 100).toFixed(2)}%</span>
              </div>
              <div className="cal-stat">
                <span className="cal-stat-label">Pico</span>
                <span className="cal-stat-value mono">{(calResult.peak * 100).toFixed(2)}%</span>
              </div>
              <div className="cal-stat">
                <span className="cal-stat-label">P95</span>
                <span className="cal-stat-value mono">{(calResult.p95 * 100).toFixed(2)}%</span>
              </div>
              <div className="cal-stat">
                <span className="cal-stat-label">Amostras</span>
                <span className="cal-stat-value mono">{calResult.sampleCount}</span>
              </div>
            </div>
            <div className="cal-result-actions">
              {onApplyCalibration && (
                <button className="btn-primary" style={{ fontSize: '0.78rem' }} onClick={applyCalibration}>
                  Aplicar resultado
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ fontSize: '0.72rem' }}
                onClick={() => { setCalState('idle'); setCalResult(null); }}
              >
                Descartar
              </button>
            </div>
            <p className="cal-hint" style={{ marginTop: 8 }}>
              Ao aplicar, o drift do stick {calStickRef.current === 'right' ? 'direito' : 'esquerdo'} será definido como <strong>{DRIFT_LABELS[calResult.classification]}</strong> e a deadzone será recalculada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
