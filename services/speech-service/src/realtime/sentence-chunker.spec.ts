import { SentenceChunker } from './sentence-chunker.js';

describe('SentenceChunker', () => {
  it('yields nothing for a delta with no sentence boundary yet', () => {
    const chunker = new SentenceChunker();

    expect(chunker.push('Hola')).toEqual([]);
    expect(chunker.push(' amigo')).toEqual([]);
  });

  it('yields one complete sentence once a terminal-punctuation-plus-whitespace boundary arrives', () => {
    const chunker = new SentenceChunker();

    expect(chunker.push('Hola amigo.')).toEqual([]);
    expect(chunker.push(' ¿Cómo estás?')).toEqual(['Hola amigo.']);
  });

  it('yields multiple sentences found within a single delta, in order', () => {
    const chunker = new SentenceChunker();

    expect(chunker.push('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('does not split on a decimal number mid-stream (no whitespace after the period yet)', () => {
    const chunker = new SentenceChunker();

    expect(chunker.push('The price is 3.')).toEqual([]);
    expect(chunker.push('14 dollars.')).toEqual([]);
    expect(chunker.push(' Done.')).toEqual(['The price is 3.14 dollars.']);
  });

  it('flush returns any trailing text with no terminal punctuation, then clears the buffer', () => {
    const chunker = new SentenceChunker();
    chunker.push('trailing thought with no period');

    expect(chunker.flush()).toBe('trailing thought with no period');
    expect(chunker.flush()).toBeNull();
  });

  it('flush returns null when nothing is buffered', () => {
    const chunker = new SentenceChunker();

    expect(chunker.flush()).toBeNull();
  });
});
