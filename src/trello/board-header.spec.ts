import { decodeBoardHeader } from './board-header';

describe('decodeBoardHeader', () => {
  it('returns undefined when no header was sent', () => {
    expect(decodeBoardHeader(undefined)).toBeUndefined();
  });

  it('decodes a percent-encoded value', () => {
    expect(decodeBoardHeader(encodeURIComponent('Café board ✓'))).toBe(
      'Café board ✓',
    );
  });

  it('passes plain ASCII through unchanged', () => {
    expect(decodeBoardHeader('Other Board')).toBe('Other Board');
  });

  it('falls back to the raw value on a malformed sequence instead of throwing', () => {
    expect(decodeBoardHeader('%')).toBe('%');
  });
});
