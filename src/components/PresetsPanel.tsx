import type { SavedPreset, UserInput } from '../types';
import { PROFILE_LABELS, PLATFORM_LABELS } from '../types';

interface Props {
  presets: SavedPreset[];
  onLoad: (preset: SavedPreset) => void;
  onDelete: (id: string) => void;
}

export default function PresetsPanel({ presets, onLoad, onDelete }: Props) {
  if (presets.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⎔</div>
        <p className="empty-state-text">
          Nenhum preset salvo ainda.<br />
          Calcule uma configuração e salve para acessar depois.
        </p>
      </div>
    );
  }

  return (
    <div className="preset-list">
      {presets.map((preset) => (
        <div key={preset.id} className="preset-item" onClick={() => onLoad(preset)}>
          <div>
            <div className="preset-name">{preset.name}</div>
            <div className="preset-meta">
              {PLATFORM_LABELS[preset.input.platform]} · {PROFILE_LABELS[preset.input.gameplayProfile]} · L {preset.result.leftStickMin}–{preset.result.leftStickMax} · R {preset.result.rightStickMin}–{preset.result.rightStickMax}
            </div>
            <div className="preset-meta">
              {new Date(preset.createdAt).toLocaleDateString('pt-BR')}
            </div>
          </div>
          <div className="preset-actions">
            <button
              className="btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(preset.id);
              }}
            >
              Remover
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
