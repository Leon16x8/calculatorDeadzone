import type {
  UserInput,
  ControllerPlatform,
  DriftIntensity,
  GameplayProfile,
  AimAssistMode,
} from '../types';
import {
  PLATFORM_LABELS,
  DRIFT_LABELS,
  PROFILE_LABELS,
  AIM_ASSIST_LABELS,
  AIM_ASSIST_HINTS,
} from '../types';

interface Props {
  input: UserInput;
  onChange: (input: UserInput) => void;
  onCalculate: () => void;
  onReset: () => void;
}

export default function InputForm({ input, onChange, onCalculate, onReset }: Props) {
  const update = <K extends keyof UserInput>(key: K, value: UserInput[K]) => {
    onChange({ ...input, [key]: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card-title">
        <span className="icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
          </svg>
        </span>
        Parâmetros de Entrada
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Sensibilidade H</label>
          <div className="form-range-wrap">
            <input
              type="range"
              className="form-range"
              min={1}
              max={20}
              step={0.01}
              value={input.sensitivityH}
              onChange={(e) => update('sensitivityH', Number(e.target.value))}
            />
            <input
              type="number"
              className="form-input-mini"
              min={1}
              max={20}
              step={0.01}
              value={input.sensitivityH}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1 && v <= 20) update('sensitivityH', Math.round(v * 100) / 100);
              }}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Sensibilidade V</label>
          <div className="form-range-wrap">
            <input
              type="range"
              className="form-range"
              min={1}
              max={20}
              step={0.01}
              value={input.sensitivityV}
              onChange={(e) => update('sensitivityV', Number(e.target.value))}
            />
            <input
              type="number"
              className="form-input-mini"
              min={1}
              max={20}
              step={0.01}
              value={input.sensitivityV}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1 && v <= 20) update('sensitivityV', Math.round(v * 100) / 100);
              }}
            />
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Multiplicador ADS</label>
        <div className="form-range-wrap">
          <input
            type="range"
            className="form-range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={input.adsMultiplier}
            onChange={(e) => update('adsMultiplier', Number(e.target.value))}
          />
          <span className="form-range-value">{input.adsMultiplier.toFixed(2)}</span>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Plataforma / Controle</label>
        <select
          className="form-select"
          data-native-cursor
          value={input.platform}
          onChange={(e) => update('platform', e.target.value as ControllerPlatform)}
        >
          {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Drift — Stick Esquerdo</label>
          <div className="chip-group">
            {(['none', 'light', 'medium', 'heavy'] as DriftIntensity[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`chip ${input.leftDrift === level ? 'active' : ''}`}
                onClick={() => update('leftDrift', level)}
              >
                {DRIFT_LABELS[level]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Drift — Stick Direito</label>
          <div className="chip-group">
            {(['none', 'light', 'medium', 'heavy'] as DriftIntensity[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`chip ${input.rightDrift === level ? 'active' : ''}`}
                onClick={() => update('rightDrift', level)}
              >
                {DRIFT_LABELS[level]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Perfil de Gameplay</label>
        <div className="chip-group">
          {(['aggressive', 'balanced', 'precision'] as GameplayProfile[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${input.gameplayProfile === p ? 'active' : ''}`}
              onClick={() => update('gameplayProfile', p)}
            >
              {PROFILE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Prioridade de Aim Assist</label>
        <div className="chip-group">
          {(['sticky', 'balanced', 'micro'] as AimAssistMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${input.aimAssistMode === m ? 'active' : ''}`}
              onClick={() => update('aimAssistMode', m)}
            >
              {AIM_ASSIST_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="form-hint">{AIM_ASSIST_HINTS[input.aimAssistMode]}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button type="submit" className="btn-primary">
          Calcular Deadzone
        </button>
        <button type="button" className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={onReset}>
          Resetar
        </button>
      </div>
    </form>
  );
}
