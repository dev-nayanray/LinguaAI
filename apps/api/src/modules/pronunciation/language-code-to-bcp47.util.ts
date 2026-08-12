/**
 * `Language.code` is a plain 2-letter ISO code (`'es'`, `'de'`, seeded
 * values, `content.prisma`) — Azure's Pronunciation Assessment API needs a
 * full BCP-47 locale (`'es-ES'`) for `speechRecognitionLanguage`. A real,
 * deliberately narrow MVP mapping covering only this platform's own
 * currently-seeded languages (`packages/database/scripts/seed.ts`) — not a
 * general-purpose locale-negotiation table. Extending this map is real,
 * cheap future work the moment a new language is actually seeded; this
 * task does not speculatively cover every ISO 639-1 code no learnable
 * language yet exists for.
 */
const LANGUAGE_CODE_TO_BCP47: Record<string, string> = {
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  ja: 'ja-JP',
  en: 'en-US',
};

/** Throws (not a silent guess) on an unmapped code — a real, honest failure over fabricating a locale that could silently mis-score a learner's attempt. */
export function languageCodeToBcp47(code: string): string {
  const locale = LANGUAGE_CODE_TO_BCP47[code];
  if (!locale) {
    throw new Error(
      `languageCodeToBcp47: no known BCP-47 locale mapping for language code "${code}"`,
    );
  }
  return locale;
}
