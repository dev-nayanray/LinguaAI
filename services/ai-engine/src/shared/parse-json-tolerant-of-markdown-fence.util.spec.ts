import { parseJsonTolerantOfMarkdownFence } from './parse-json-tolerant-of-markdown-fence.util.js';

describe('parseJsonTolerantOfMarkdownFence', () => {
  it('parses plain, unfenced JSON', () => {
    expect(parseJsonTolerantOfMarkdownFence('{"a":1}', 'Caller')).toEqual({ a: 1 });
  });

  it('strips a ```json fence', () => {
    expect(parseJsonTolerantOfMarkdownFence('```json\n{"a":1}\n```', 'Caller')).toEqual({ a: 1 });
  });

  it('strips a bare ``` fence', () => {
    expect(parseJsonTolerantOfMarkdownFence('```\n{"a":1}\n```', 'Caller')).toEqual({ a: 1 });
  });

  it('throws a caller-prefixed error on invalid JSON, never guessing', () => {
    expect(() => parseJsonTolerantOfMarkdownFence('not json', 'MyService')).toThrow(
      'MyService: model response was not valid JSON',
    );
  });
});
