import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImageProcessor from './ImageProcessor';

const preloadMock = vi.fn();
const processImageMock = vi.fn();

// ImageProcessor only touches ModelService at the module boundary (the
// RecognitionResult/HistoryEntry types it also imports are erased at
// compile time), so replacing just that export is enough to drive the
// component through every state without a real TF.js model or network
// access — the thing that made this component effectively untestable
// before the pure-decode logic was split out of the class in modelService.ts.
vi.mock('../services/modelService', () => ({
  ModelService: {
    getInstance: () => ({
      preload: preloadMock,
      processImage: processImageMock,
      isReady: () => true,
      dispose: () => {},
    }),
  },
}));

function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

beforeEach(() => {
  preloadMock.mockReset().mockResolvedValue(undefined);
  processImageMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ImageProcessor', () => {
  it('disables recognition until the model finishes loading', async () => {
    render(<ImageProcessor />);
    expect(screen.getByText(/loading model/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recognize text/i })).toBeDisabled();

    await screen.findByRole('button', { name: /recognize text/i });
    // Still disabled: no image has been selected yet.
    expect(screen.getByRole('button', { name: /recognize text/i })).toBeDisabled();
  });

  it('shows an inline error and never calls the model when the model fails to load', async () => {
    preloadMock.mockRejectedValueOnce(new Error('network error'));
    render(<ImageProcessor />);

    await screen.findByText(/model failed to load/i);
    expect(processImageMock).not.toHaveBeenCalled();
  });

  it('rejects a non-image file without touching the model', async () => {
    const { container } = render(<ImageProcessor />);
    const file = new File(['not an image'], 'notes.pdf', { type: 'application/pdf' });

    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    await screen.findByText(/please upload an image file/i);
    expect(processImageMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /recognize text/i })).toBeDisabled();
  });

  it('rejects an oversized image file', async () => {
    const { container } = render(<ImageProcessor />);
    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });

    fireEvent.change(getFileInput(container), { target: { files: [oversized] } });

    await screen.findByText(/less than 5MB/i);
  });

  it('runs recognition on a valid image and renders per-character confidence', async () => {
    processImageMock.mockResolvedValue({
      text: 'ab',
      confidence: 87.5,
      characters: [
        { char: 'a', confidence: 95 },
        { char: 'b', confidence: 80 },
      ],
    });

    const { container } = render(<ImageProcessor />);
    const file = new File([new Uint8Array(1024)], 'word.png', { type: 'image/png' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    const button = await screen.findByRole('button', { name: /recognize text/i });
    await vi.waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.click(button);

    const resultEl = await screen.findByLabelText('Recognized text: ab');
    const chars = resultEl.querySelectorAll('span');
    expect(chars).toHaveLength(2);
    expect(chars[0]).toHaveAttribute('title', "'a' — 95.0% confidence");
    expect(chars[1]).toHaveAttribute('title', "'b' — 80.0% confidence");

    expect(screen.getByText('87.5%')).toBeInTheDocument();
    expect(processImageMock).toHaveBeenCalledWith(file);
  });

  it('surfaces a friendly error if recognition throws', async () => {
    processImageMock.mockRejectedValue(new Error('boom'));
    const { container } = render(<ImageProcessor />);
    const file = new File([new Uint8Array(1024)], 'word.png', { type: 'image/png' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });

    const button = await screen.findByRole('button', { name: /recognize text/i });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await screen.findByText(/error processing image/i);
  });
});
