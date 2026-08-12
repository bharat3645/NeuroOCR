import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CharacterPrediction } from '../services/modelService';

export interface HistoryEntry {
  text: string;
  confidence: number;
  /**
   * Per-character confidence breakdown. Optional so history persisted by an
   * older version of this app (localStorage predates this field) still
   * loads — ImageProcessor falls back to a plain (uncolored) text render
   * when it's absent instead of crashing.
   */
  characters?: CharacterPrediction[];
}

interface HistoryProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const History: React.FC<HistoryProps> = ({ history, onSelect, isOpen, onToggle }) => {
  return (
    <div className={`fixed left-0 top-0 h-screen z-40 flex transition-transform duration-300 ease-in-out ${!isOpen ? '-translate-x-64' : 'translate-x-0'}`}>
      <div className="w-64 bg-[var(--paper-bg)] border-r border-[var(--text-brown)] p-4 h-full overflow-y-auto shadow-lg">
        <h2 className="text-xl font-bold text-[var(--text-brown)] mb-4">
          History
        </h2>
        {history.length === 0 ? (
          <p className="text-[var(--text-brown)] opacity-70">No history yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry, index) => (
              <li
                key={index}
                className="p-3 bg-[var(--cream-bg)] rounded-lg shadow-md cursor-pointer hover:bg-[var(--text-brown)] hover:text-white transition group"
                onClick={() => onSelect(entry)}
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="line-clamp-2">
                    {entry.text.length > 30 ? `${entry.text.slice(0, 30)}…` : entry.text || '(empty)'}
                  </p>
                  <span className="text-xs opacity-70 whitespace-nowrap">
                    {entry.confidence.toFixed(1)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <button
        onClick={onToggle}
        className="h-12 px-1 bg-[var(--paper-bg)] border-r border-t border-b border-[var(--text-brown)] shadow-md rounded-r-lg flex items-center justify-center hover:bg-[var(--cream-bg)] transition-colors"
        aria-label={isOpen ? "Close history" : "Open history"}
      >
        {isOpen ? (
          <ChevronLeft className="w-5 h-5 text-[var(--text-brown)]" />
        ) : (
          <ChevronRight className="w-5 h-5 text-[var(--text-brown)]" />
        )}
      </button>
    </div>
  );
};

export default History;