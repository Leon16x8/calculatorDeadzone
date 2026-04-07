import { useState, useMemo } from 'react';
import type { DeadzoneResult, SavedPreset, UserInput } from '../types';
import { WZ_MAX, CURVE_LABELS, DRIFT_LABELS, PLATFORM_LABELS, PROFILE_LABELS, AIM_ASSIST_LABELS } from '../types';

interface Props {
  result: DeadzoneResult;
  input: UserInput;
  presets: SavedPreset[];
  onSave: () => void;
}

interface DeadzoneRowProps {
  label: string;
  value: number;
  explanation: string;
}

function safe(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function DeadzoneRow({ label, value, explanation }: DeadzoneRowProps) {
  const [showTip, setShowTip] = useState(false);
  const safeVal = safe(value);
  const pct = Math.max(0, Math.min(100, (safeVal / WZ_MAX) * 100));

  return (
    <div className="wz-row" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <span className="wz-row-label">{label}</span>
      <div className="wz-row-track">
        <div className="wz-row-fill" style={{ width: `${pct}%` }} />
        <div className="wz-row-thumb" style={{ left: `${pct}%` }} />
      </div>
      <span className="wz-row-value mono">{safeVal}</span>
      {showTip && <div className="wz-row-tip">{explanation}</div>}
    </div>
  );
}

// ── Comparison helpers ───────────────────────────
//
// Triadic comparison: Atual (form) | Recomendado (calc) | Preset (saved)
// Grouped by category. Input rows have no "Recomendado" (user choices).
// Output rows have no "Atual" (calculated, not set by user).

interface CmpRow {
  label: string;
  atual: string;
  recomendado: string;
  preset: string;
  changed: boolean;
}

function buildTriadicRows(
  curInput: UserInput, curResult: DeadzoneResult,
  preInput: UserInput, preResult: DeadzoneResult,
): { inputs: CmpRow[]; outputs: CmpRow[] } {
  const NA = '\x00'; // sentinel for N/A cells — rendered specially in CmpSection

  const inp = (label: string, va: string, vb: string): CmpRow => ({
    label, atual: va, recomendado: NA, preset: vb, changed: va !== vb,
  });

  const out = (label: string, va: number, vb: number): CmpRow => ({
    label, atual: NA, recomendado: `${va}`, preset: `${vb}`,
    changed: va !== vb,
  });

  const inputs: CmpRow[] = [
    inp('Sensibilidade', `${curInput.sensitivityH}/${curInput.sensitivityV}`, `${preInput.sensitivityH}/${preInput.sensitivityV}`),
    inp('ADS Multiplier', curInput.adsMultiplier.toFixed(2), preInput.adsMultiplier.toFixed(2)),
    inp('Plataforma', PLATFORM_LABELS[curInput.platform], PLATFORM_LABELS[preInput.platform]),
    inp('Drift Esquerdo', DRIFT_LABELS[curInput.leftDrift], DRIFT_LABELS[preInput.leftDrift]),
    inp('Drift Direito', DRIFT_LABELS[curInput.rightDrift], DRIFT_LABELS[preInput.rightDrift]),
    inp('Perfil', PROFILE_LABELS[curInput.gameplayProfile], PROFILE_LABELS[preInput.gameplayProfile]),
    inp('Aim Assist', AIM_ASSIST_LABELS[curInput.aimAssistMode], AIM_ASSIST_LABELS[preInput.aimAssistMode]),
  ];

  const outputs: CmpRow[] = [
    out('Left Stick Min', curResult.leftStickMin, preResult.leftStickMin),
    out('Left Stick Max', curResult.leftStickMax, preResult.leftStickMax),
    out('Right Stick Min', curResult.rightStickMin, preResult.rightStickMin),
    out('Right Stick Max', curResult.rightStickMax, preResult.rightStickMax),
    out('Left Trigger', curResult.leftTrigger, preResult.leftTrigger),
    out('Right Trigger', curResult.rightTrigger, preResult.rightTrigger),
    {
      label: 'Curva', atual: NA,
      recomendado: CURVE_LABELS[curResult.responseCurve],
      preset: CURVE_LABELS[preResult.responseCurve],
      changed: curResult.responseCurve !== preResult.responseCurve,
    },
    {
      label: 'ADS Ajuste', atual: NA,
      recomendado: `${safe(curResult.adsAdjustment).toFixed(2)}x`,
      preset: `${safe(preResult.adsAdjustment).toFixed(2)}x`,
      changed: curResult.adsAdjustment !== preResult.adsAdjustment,
    },
    {
      label: 'Ajuste Fino', atual: NA,
      recomendado: `${safe(curResult.finetuneRange[0])}–${safe(curResult.finetuneRange[1])}`,
      preset: `${safe(preResult.finetuneRange[0])}–${safe(preResult.finetuneRange[1])}`,
      changed: curResult.finetuneRange[0] !== preResult.finetuneRange[0] || curResult.finetuneRange[1] !== preResult.finetuneRange[1],
    },
  ];

  return { inputs, outputs };
}

// ── Tutorial helpers ─────────────────────────────
//
// Gera no máximo 5 passos de ajuste fino, sem redundância.
//
// Estratégia:
//   1. Gerar candidatos com tema (um por tema)
//   2. Ordenar por prioridade
//   3. Limitar a 5
//
// Temas: teste-inicial, valores-iniciais, drift, mira, ads/curva

const MAX_TUTORIAL_STEPS = 5;

type TutorialTheme = 'start' | 'values' | 'drift' | 'aim' | 'ads-curve';

interface TutorialCandidate {
  theme: TutorialTheme;
  text: string;
  priority: number;
}

function generateTutorialSteps(result: DeadzoneResult, input: UserInput): string[] {
  const candidates: TutorialCandidate[] = [];

  // ── Tema: start (sempre presente) ──
  candidates.push({
    theme: 'start',
    text: 'Teste esta configuração por 3 partidas antes de ajustar.',
    priority: 0,
  });

  // ── Tema: values ──
  candidates.push({
    theme: 'values',
    text: `Use os mínimos recomendados (L: ${result.leftStickMin}, R: ${result.rightStickMin}). Só aumente se perceber drift residual.`,
    priority: 1,
  });

  // ── Tema: drift ──
  const hasDrift = input.leftDrift !== 'none' || input.rightDrift !== 'none';
  if (hasDrift) {
    const heavy = input.leftDrift === 'heavy' || input.rightDrift === 'heavy';
    if (heavy) {
      candidates.push({
        theme: 'drift',
        text: 'Drift forte detectado — use o valor máximo diretamente. Se persistir, o controle pode precisar de manutenção.',
        priority: 2,
      });
    } else {
      candidates.push({
        theme: 'drift',
        text: 'Se ainda houver ghost input, suba 1–2 pontos no stick com drift. Teste entre cada ajuste.',
        priority: 2,
      });
    }
  }

  // ── Tema: aim (right stick / mira) ──
  if (result.rightStickMin >= 8) {
    candidates.push({
      theme: 'aim',
      text: `Right Stick Min em ${result.rightStickMin} — se a mira parecer pesada, reduza 1 ponto por vez.`,
      priority: 3,
    });
  } else if (result.rightStickMin <= 2) {
    candidates.push({
      theme: 'aim',
      text: `Right Stick Min baixo (${result.rightStickMin}) — se notar movimentos fantasma na mira, suba 1–2 pontos.`,
      priority: 3,
    });
  }

  // ── Tema: ads-curve ──
  if (result.adsAdjustment !== input.adsMultiplier) {
    candidates.push({
      theme: 'ads-curve',
      text: `ADS ajustado para ${result.adsAdjustment.toFixed(2)}x. Teste o tracking e ajuste em 0.05 se necessário.`,
      priority: 4,
    });
  } else if (result.responseCurve === 'linear') {
    candidates.push({
      theme: 'ads-curve',
      text: 'Curva Linear: se o aim assist parecer fraco em médias distâncias, teste Standard.',
      priority: 4,
    });
  } else if (result.responseCurve === 'dynamic') {
    candidates.push({
      theme: 'ads-curve',
      text: 'Curva Dynamic: boa para flicks, mas pode exigir ajuste na sensibilidade vertical.',
      priority: 4,
    });
  }

  // Dedup por tema, ordenar por prioridade, limitar
  const seen = new Set<TutorialTheme>();
  const final: string[] = [];
  for (const c of candidates.sort((a, b) => a.priority - b.priority)) {
    if (seen.has(c.theme)) continue;
    seen.add(c.theme);
    final.push(c.text);
    if (final.length >= MAX_TUTORIAL_STEPS) break;
  }
  return final;
}

const NA_SENTINEL = '\x00';

function CmpCell({ value }: { value: string }) {
  if (value === NA_SENTINEL) {
    return <span className="cmp-col-val cmp-na-cell"><span className="cmp-na-badge">n/a</span></span>;
  }
  return <span className="cmp-col-val mono">{value}</span>;
}

function CmpSection({ title, rows }: { title: string; rows: CmpRow[] }) {
  return (
    <div className="cmp-group">
      <div className="cmp-group-title">{title}</div>
      <div className="cmp-table-header">
        <span className="cmp-col-label">Parâmetro</span>
        <span className="cmp-col-val">Atual</span>
        <span className="cmp-col-val">Recomendado</span>
        <span className="cmp-col-val">Preset</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className={`cmp-table-row ${row.changed ? 'cmp-changed' : ''}`}>
          <span className="cmp-col-label">{row.label}</span>
          <CmpCell value={row.atual} />
          <CmpCell value={row.recomendado} />
          <CmpCell value={row.preset} />
        </div>
      ))}
    </div>
  );
}

export default function ResultsPanel({ result, input, presets, onSave }: Props) {
  const [comparePresetId, setComparePresetId] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);

  const comparePreset = useMemo(
    () => presets.find((p) => p.id === comparePresetId) ?? null,
    [presets, comparePresetId],
  );

  const triadicData = useMemo(
    () => (comparePreset ? buildTriadicRows(input, result, comparePreset.input, comparePreset.result) : null),
    [input, result, comparePreset],
  );

  const tutorialSteps = useMemo(() => generateTutorialSteps(result, input), [result, input]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          <span className="icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
          </span>
          Deadzone Inputs
        </div>
        <button className="btn-secondary" onClick={onSave}>Salvar Preset</button>
      </div>

      <p className="wz-panel-hint">
        Valores na escala 0–{WZ_MAX} do Warzone — copie direto para o jogo.
      </p>

      <div className="wz-panel">
        <DeadzoneRow label="LEFT STICK MIN" value={result.leftStickMin} explanation={result.explanations.leftStickMin} />
        <DeadzoneRow label="LEFT STICK MAX" value={result.leftStickMax} explanation={result.explanations.leftStickMax} />
        <DeadzoneRow label="RIGHT STICK MIN" value={result.rightStickMin} explanation={result.explanations.rightStickMin} />
        <DeadzoneRow label="RIGHT STICK MAX" value={result.rightStickMax} explanation={result.explanations.rightStickMax} />
        <div className="wz-divider" />
        <DeadzoneRow label="LEFT TRIGGER" value={result.leftTrigger} explanation={result.explanations.leftTrigger} />
        <DeadzoneRow label="RIGHT TRIGGER" value={result.rightTrigger} explanation={result.explanations.rightTrigger} />
      </div>

      <div className="wz-extras">
        <div className="result-block">
          <div className="result-block-header">
            <span className="result-block-label">Curva de Resposta</span>
            <span className="result-block-value">{CURVE_LABELS[result.responseCurve]}</span>
          </div>
          <p className="result-block-reason">{result.responseCurveReason}</p>
        </div>

        <div className="result-block">
          <div className="result-block-header">
            <span className="result-block-label">Ajuste ADS Sugerido</span>
            <span className="result-block-value">{safe(result.adsAdjustment).toFixed(2)}x</span>
          </div>
          <p className="result-block-reason">{result.adsAdjustmentReason}</p>
        </div>

        <div className="result-block">
          <div className="result-block-header">
            <span className="result-block-label">Faixa de Ajuste Fino</span>
            <span className="result-block-value">{safe(result.finetuneRange[0])} – {safe(result.finetuneRange[1])}</span>
          </div>
          <p className="result-block-reason">{result.finetuneReason}</p>
        </div>
      </div>

      {/* ── Modo comparação ────────────────────── */}
      <div className="cmp-section">
        <button
          className="btn-secondary"
          style={{ width: '100%', marginBottom: showCompare ? 12 : 0 }}
          onClick={() => setShowCompare(!showCompare)}
        >
          {showCompare ? 'Fechar comparação' : 'Comparar com preset'}
        </button>

        {showCompare && (
          <div className="cmp-body fade-in">
            {presets.length === 0 ? (
              <p className="cmp-empty">Nenhum preset salvo. Salve uma configuração para comparar.</p>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Preset para comparação</label>
                  <select
                    className="form-select"
                    data-native-cursor
                    value={comparePresetId ?? ''}
                    onChange={(e) => setComparePresetId(e.target.value || null)}
                  >
                    <option value="">Selecione um preset...</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {triadicData && comparePreset && (
                  <div className="cmp-table fade-in">
                    <CmpSection title="Configuração" rows={triadicData.inputs} />
                    <CmpSection title="Deadzones e Extras" rows={triadicData.outputs} />
                    <div className="cmp-summary">
                      Comparando com <strong>{comparePreset.name}</strong>
                      {' · '}
                      {new Date(comparePreset.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Tutorial de ajuste fino ────────────── */}
      <div className="tutorial-section">
        <button
          className="btn-secondary"
          style={{ width: '100%', marginBottom: showTutorial ? 12 : 0 }}
          onClick={() => setShowTutorial(!showTutorial)}
        >
          {showTutorial ? 'Ocultar guia de ajuste' : 'Guia de ajuste fino'}
        </button>

        {showTutorial && (
          <div className="tutorial-body fade-in">
            <div className="tutorial-header">
              <span className="icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </span>
              Guia de Ajuste Fino
            </div>
            <ol className="tutorial-steps">
              {tutorialSteps.map((text, i) => (
                <li key={i} className="tutorial-step">{text}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
