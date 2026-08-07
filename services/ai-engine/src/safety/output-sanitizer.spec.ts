import { sanitizeOutput } from './output-sanitizer.js';

describe('sanitizeOutput', () => {
  it('strips a script tag pair, leaving surrounding text intact', () => {
    expect(sanitizeOutput('<script>alert(1)</script>safe text')).toBe('alert(1)safe text');
  });

  it('strips an arbitrary HTML tag with attributes', () => {
    expect(sanitizeOutput('<img src="x" onerror="alert(1)">click me')).toBe('click me');
  });

  it('leaves plain text completely unchanged', () => {
    expect(sanitizeOutput('The subjunctive mood expresses doubt.')).toBe(
      'The subjunctive mood expresses doubt.',
    );
  });

  it('leaves markdown formatting unchanged (not itself an HTML tag)', () => {
    expect(sanitizeOutput('**bold** and _italic_ and [a link](https://example.com)')).toBe(
      '**bold** and _italic_ and [a link](https://example.com)',
    );
  });

  it('does not treat a bare "<" (e.g. a less-than comparison) as a tag', () => {
    expect(sanitizeOutput('5 < 10 is true')).toBe('5 < 10 is true');
  });
});
