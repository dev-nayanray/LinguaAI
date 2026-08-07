import { renderTemplate } from './render-template.js';

describe('renderTemplate', () => {
  it('substitutes every placeholder with its supplied value', () => {
    const result = renderTemplate('Hello {{name}}, you are learning {{language}}.', {
      name: 'Alex',
      language: 'Spanish',
    });

    expect(result).toBe('Hello Alex, you are learning Spanish.');
  });

  it('substitutes the same placeholder every time it repeats', () => {
    const result = renderTemplate('{{word}} means {{word}}.', { word: 'echo' });

    expect(result).toBe('echo means echo.');
  });

  it('returns the template unchanged when it has no placeholders', () => {
    const result = renderTemplate('No variables here.', {});

    expect(result).toBe('No variables here.');
  });

  it('throws a clear error rather than silently rendering an undefined placeholder', () => {
    expect(() => renderTemplate('Hello {{name}}.', {})).toThrow(
      'Prompt template references undefined variable "{{name}}" — refusing to render with a missing value',
    );
  });

  it('ignores an extra supplied variable the template does not reference', () => {
    const result = renderTemplate('Hello {{name}}.', { name: 'Alex', unused: 'ignored' });

    expect(result).toBe('Hello Alex.');
  });
});
