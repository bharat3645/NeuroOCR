import React, { useCallback, useEffect, useState } from 'react';
import Navbar from './Navbar';
import History, { HistoryEntry } from './History';
import Features from './Features';
import ImageProcessor from './ImageProcessor';
import { RecognitionResult } from '../services/modelService';

const HISTORY_KEY = 'neuroocr.history';
const HISTORY_LIMIT = 25;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // localStorage unavailable (private mode) or corrupt data - fail open
  }
}

const Home: React.FC = () => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleRecognized = useCallback((entry: RecognitionResult) => {
    setSelected(null); // a fresh recognition takes over from any history preview
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // best-effort persistence only
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--cream-bg)]">
      <Navbar />
      <History
        history={history}
        isOpen={historyOpen}
        onToggle={() => setHistoryOpen((open) => !open)}
        onSelect={(entry) => setSelected(entry)}
      />

      <main className={`transition-[padding] duration-300 ${historyOpen ? 'pl-64' : 'pl-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-brown)]">
              Upload a handwriting sample
            </h1>
            <p className="mt-2 text-[var(--text-brown)] opacity-75">
              Recognition runs fully client-side with TensorFlow.js — no image ever leaves your browser.
            </p>
          </div>
          <ImageProcessor onRecognized={handleRecognized} externalResult={selected} />
        </div>
        <Features />
      </main>
    </div>
  );
};

export default Home;
