import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, UploadCloud } from 'lucide-react';
import { ModelService, RecognitionResult } from '../services/modelService';
import { HistoryEntry } from './History';
import { validateImageFile } from '../utils/validation';

/** Tailwind classes for a character's confidence tier (see the legend below the result). */
function confidenceTierClass(confidence: number): string {
  if (confidence >= 80) return 'border-green-600 bg-green-600/10';
  if (confidence >= 50) return 'border-yellow-600 bg-yellow-600/10';
  return 'border-red-600 bg-red-600/10';
}

interface ImageProcessorProps {
  onRecognized?: (entry: RecognitionResult) => void;
  /** Externally selected text (e.g. clicked from History) to display instead of live results. */
  externalResult?: HistoryEntry | null;
}

type ModelStatus = 'loading' | 'ready' | 'error';

const ImageProcessor: React.FC<ImageProcessorProps> = ({ onRecognized, externalResult }) => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string>('');
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    ModelService.getInstance()
      .preload()
      .then(() => {
        if (!cancelled) setModelStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load handwriting model:', err);
        if (!cancelled) setModelStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayResult = externalResult ?? result;
  // History entries persisted before per-character confidence existed won't
  // have this field — fall back to an empty breakdown instead of crashing.
  const displayChars = displayResult?.characters ?? [];

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedImage(file);
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const processImage = async () => {
    if (!selectedImage) {
      setError('Please select an image first');
      return;
    }

    setProcessing(true);
    setError('');
    setResult(null);

    try {
      const modelService = ModelService.getInstance();
      const recognition = await modelService.processImage(selectedImage);
      setResult(recognition);
      onRecognized?.(recognition);
    } catch (err) {
      setError('Error processing image. Please try again.');
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="notebook-paper p-4 mb-6 text-sm flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--text-brown)] opacity-70 mt-0.5" />
        <p className="text-[var(--text-brown)] opacity-80">
          Demo model: trained end-to-end on a small IAM handwriting-forms subset using
          form/writer metadata as a placeholder label (the dataset doesn't ship real
          per-word transcriptions). Treat recognition output as a pipeline demo, not
          production-accuracy OCR — see the project README for details.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`upload-button rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging ? 'bg-[var(--cream-bg)]' : ''
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          ref={fileInputRef}
          className="hidden"
        />
        <UploadCloud className="w-8 h-8 mx-auto mb-2 text-[var(--text-brown)]" />
        <p className="font-semibold">Click to select, or drag and drop an image</p>
        {selectedImage && (
          <p className="mt-2 text-sm opacity-70">Selected: {selectedImage.name}</p>
        )}
      </div>

      {imagePreview && (
        <div className="mt-6 paper-card p-3">
          <img
            src={imagePreview}
            alt="Preview"
            className="max-w-full h-auto rounded-md mx-auto"
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={processImage}
          disabled={!selectedImage || processing || modelStatus !== 'ready'}
          className={`px-5 py-2 rounded font-semibold transition-colors ${
            !selectedImage || processing || modelStatus !== 'ready'
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-[var(--text-brown)] text-[var(--paper-bg)] hover:opacity-90'
          }`}
        >
          {processing ? 'Processing…' : 'Recognize Text'}
        </button>

        {modelStatus === 'loading' && (
          <span className="flex items-center gap-2 text-sm opacity-70">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading model…
          </span>
        )}
        {modelStatus === 'error' && (
          <span className="text-sm text-red-700">
            Model failed to load — run the app via `npm run dev` from the frontend
            folder so /models/handwriting-model/model.json is served.
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {displayResult && (
        <div className="mt-6 paper-card p-4">
          <h3 className="font-bold mb-2">Recognized Text</h3>

          {displayChars.length > 0 ? (
            <p
              className="whitespace-pre-wrap font-mono text-lg min-h-[1.5em] leading-loose"
              aria-label={`Recognized text: ${displayResult.text}`}
            >
              {displayChars.map((c, i) => (
                <span
                  key={i}
                  title={`'${c.char === ' ' ? '(space)' : c.char}' — ${c.confidence.toFixed(1)}% confidence`}
                  className={`border-b-2 ${confidenceTierClass(c.confidence)}`}
                >
                  {c.char}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-lg opacity-50 font-mono min-h-[1.5em]">
              {displayResult.text || '(no characters recognized)'}
            </p>
          )}

          {displayChars.length > 0 && (
            <div className="mt-2 flex gap-3 text-xs opacity-60">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0 border-b-2 border-green-600" /> high
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0 border-b-2 border-yellow-600" /> medium
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0 border-b-2 border-red-600" /> low
              </span>
              <span className="opacity-70">(hover a character for its exact confidence)</span>
            </div>
          )}

          <div className="mt-3">
            <div className="flex justify-between text-xs opacity-70 mb-1">
              <span>Overall confidence</span>
              <span>{displayResult.confidence.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--cream-bg)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--text-brown)] rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, displayResult.confidence))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageProcessor;
