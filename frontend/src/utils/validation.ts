/**
 * Pure, dependency-free validation for user-uploaded images. Extracted out
 * of ImageProcessor.tsx so the rules (and their exact wording) are unit
 * tested directly instead of only being exercised by clicking through the
 * UI. Returns a human-readable error string, or null if the file is valid.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateImageFile(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES
): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please upload an image file';
  }
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return `Image size should be less than ${maxMb}MB`;
  }
  if (file.size === 0) {
    return 'That file appears to be empty';
  }
  return null;
}
