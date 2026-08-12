import { languageCodeToBcp47 } from './language-code-to-bcp47.util.js';

describe('languageCodeToBcp47', () => {
  it('maps every currently-seeded language code to its real BCP-47 locale', () => {
    expect(languageCodeToBcp47('es')).toBe('es-ES');
    expect(languageCodeToBcp47('de')).toBe('de-DE');
    expect(languageCodeToBcp47('fr')).toBe('fr-FR');
    expect(languageCodeToBcp47('ja')).toBe('ja-JP');
    expect(languageCodeToBcp47('en')).toBe('en-US');
  });

  it('throws a clear, honest error for an unmapped code rather than guessing', () => {
    expect(() => languageCodeToBcp47('xx')).toThrow(
      'no known BCP-47 locale mapping for language code "xx"',
    );
  });
});
