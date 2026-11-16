/**
 * Thin wrapper over the on-device OCR module (Google ML Kit on Android,
 * Apple Vision on iOS) provided by `expo-text-extractor`.
 *
 * The native module is NOT included in Expo Go, so we load it lazily and
 * report `ocrAvailable = false` there. In that case the scan screen still
 * works: it shows the photo and lets the user type the total by hand.
 * In the APK built with EAS, OCR works fully offline.
 */
type OcrModule = {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
};

let mod: OcrModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-text-extractor') as OcrModule;
  if (!mod.isSupported) mod = null;
} catch {
  mod = null;
}

export const ocrAvailable = mod !== null;

export async function recognizeText(uri: string): Promise<string[]> {
  if (!mod) return [];
  return mod.extractTextFromImage(uri);
}
