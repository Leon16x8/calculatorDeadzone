import { useState } from 'react';

interface Props {
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function SaveModal({ onSave, onClose }: Props) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <div className="save-modal-overlay" onClick={onClose}>
      <div className="save-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Salvar Preset</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nome do Preset</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Config competitiva PS5"
              autoFocus
            />
          </div>
          <div className="save-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
