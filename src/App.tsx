import { useState, useEffect, useCallback } from 'react';
import type { UserInput, DeadzoneResult, SavedPreset } from './types';
import { DEFAULT_INPUT } from './types';
import { calculateDeadzone } from './lib/calculator';
import {
  loadLastInput,
  saveLastInput,
  loadLastResult,
  saveLastResult,
  isResultFresh,
  loadPresets,
  savePreset,
  deletePreset,
  generateId,
  migrateStorageIfNeeded,
} from './lib/storage';
import InputForm from './components/InputForm';
import ResultsPanel from './components/ResultsPanel';
import DriftSimulator from './components/DriftSimulator';
import PresetsPanel from './components/PresetsPanel';
import SaveModal from './components/SaveModal';
import ShinyText from './components/ShinyText';
import ScrambledText from './components/ScrambledText';
import TargetCursor from './components/TargetCursor';
import Silk from './components/Silk';

type RightTab = 'results' | 'simulator' | 'presets';

migrateStorageIfNeeded();

const initialInput = loadLastInput();

export default function App() {
  const [input, setInput] = useState<UserInput>(initialInput);
  const [result, setResult] = useState<DeadzoneResult | null>(() => {
    const saved = loadLastResult();
    if (saved && isResultFresh(initialInput)) return saved;
    const fresh = calculateDeadzone(initialInput);
    saveLastResult(fresh, initialInput);
    return fresh;
  });
  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [activeTab, setActiveTab] = useState<RightTab>('results');
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    saveLastInput(input);
  }, [input]);

  const handleCalculate = useCallback(() => {
    const r = calculateDeadzone(input);
    setResult(r);
    saveLastResult(r, input);
    setActiveTab('results');
  }, [input]);

  const handleReset = useCallback(() => {
    setInput(DEFAULT_INPUT);
    setResult(null);
    saveLastInput(DEFAULT_INPUT);
    localStorage.removeItem('wz-dz-last-result');
    localStorage.removeItem('wz-dz-last-fp');
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      if (!result) return;
      const preset: SavedPreset = {
        id: generateId(),
        name,
        input,
        result,
        createdAt: Date.now(),
      };
      savePreset(preset);
      setPresets(loadPresets());
      setShowSave(false);
    },
    [input, result],
  );

  const handleLoadPreset = useCallback((preset: SavedPreset) => {
    setInput(preset.input);
    setResult(preset.result);
    saveLastInput(preset.input);
    saveLastResult(preset.result, preset.input);
    setActiveTab('results');
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    deletePreset(id);
    setPresets(loadPresets());
  }, []);

  return (
    <div className="app-container">
      <div className="silk-bg">
        <Silk speed={3} scale={1} color="#1a1a2e" noiseIntensity={1.2} rotation={0} />
      </div>
      <TargetCursor targetSelector=".btn-primary, .btn-secondary, .btn-danger, .chip, .tab, .preset-item, .toggle" spinDuration={2} hideDefaultCursor={true} />
      <header className="app-header">
        <h1 className="app-title">
          <ShinyText
            text="Warzone Deadzone Calculator"
            color="#9d9db5"
            shineColor="#ffffff"
            speed={3}
            spread={120}
          />
        </h1>
        <p className="app-subtitle">
          <ScrambledText
            text="Configure seu controle com precisão e encontre a deadzone ideal para o seu estilo de jogo"
            radius={80}
            duration={1}
            scrambleChars=".:*#&@!?"
          />
        </p>
        <span className="app-disclaimer">
          Valores são estimativas práticas baseadas em heurísticas comunitárias, não dados oficiais da Activision
        </span>
      </header>

      <div className="main-grid">
        <div className="card">
          <InputForm input={input} onChange={setInput} onCalculate={handleCalculate} onReset={handleReset} />
        </div>

        <div className="card">
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              Resultados
            </button>
            <button
              className={`tab ${activeTab === 'simulator' ? 'active' : ''}`}
              onClick={() => setActiveTab('simulator')}
            >
              Simulador
            </button>
            <button
              className={`tab ${activeTab === 'presets' ? 'active' : ''}`}
              onClick={() => setActiveTab('presets')}
            >
              Presets ({presets.length})
            </button>
          </div>

          {activeTab === 'results' && (
            result ? (
              <ResultsPanel result={result} input={input} presets={presets} onSave={() => setShowSave(true)} />
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">◎</div>
                <p className="empty-state-text">
                  Preencha os parâmetros e clique em <strong>Calcular Deadzone</strong> para ver as recomendações.
                </p>
              </div>
            )
          )}

          {activeTab === 'simulator' && (
            <DriftSimulator
              input={input}
              onApplyCalibration={(stick, driftIntensity) => {
                const key = stick === 'left' ? 'leftDrift' : 'rightDrift';
                const updated = { ...input, [key]: driftIntensity } as typeof input;
                setInput(updated);
                const r = calculateDeadzone(updated);
                setResult(r);
                saveLastInput(updated);
                saveLastResult(r, updated);
              }}
            />
          )}

          {activeTab === 'presets' && (
            <PresetsPanel
              presets={presets}
              onLoad={handleLoadPreset}
              onDelete={handleDeletePreset}
            />
          )}
        </div>
      </div>

      {showSave && (
        <SaveModal onSave={handleSavePreset} onClose={() => setShowSave(false)} />
      )}
    </div>
  );
}
