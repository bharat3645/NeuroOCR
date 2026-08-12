import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from './validation';

function makeFile(opts: { type: string; size: number; name?: string }): File {
  const bytes = new Uint8Array(Math.max(0, opts.size));
  const file = new File([bytes], opts.name ?? 'sample', { type: opts.type });
  // jsdom's File.size is derived from the Blob parts, which already gives us
  // the right size here — no need to override it.
  return file;
}

describe('validateImageFile', () => {
  it('accepts a small image file', () => {
    const file = makeFile({ type: 'image/png', size: 1024 });
    expect(validateImageFile(file)).toBeNull();
  });

  it('rejects non-image MIME types', () => {
    const file = makeFile({ type: 'application/pdf', size: 1024 });
    expect(validateImageFile(file)).toMatch(/image file/i);
  });

  it('rejects files with no MIME type at all', () => {
    const file = makeFile({ type: '', size: 1024 });
    expect(validateImageFile(file)).toMatch(/image file/i);
  });

  it('rejects files over the size limit', () => {
    const file = makeFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 });
    expect(validateImageFile(file)).toMatch(/5MB/);
  });

  it('accepts a file exactly at the size limit', () => {
    const file = makeFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES });
    expect(validateImageFile(file)).toBeNull();
  });

  it('rejects empty files', () => {
    const file = makeFile({ type: 'image/png', size: 0 });
    expect(validateImageFile(file)).toMatch(/empty/i);
  });

  it('honors a custom size limit', () => {
    const oneMb = 1024 * 1024;
    const file = makeFile({ type: 'image/png', size: 2 * oneMb });
    expect(validateImageFile(file, oneMb)).toMatch(/1MB/);
  });
});
