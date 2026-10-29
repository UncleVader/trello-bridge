import { extractTicketId, sameCardIdentity } from './ticket-id';

describe('ticket identity', () => {
  it.each([
    ['FB-12: title', 'fb-12'],
    ['FB-2.1: title', 'fb-2.1'],
    ['1C-12: title', '1c-12'],
    ['E2: Epic', 'e2'],
    ['E2-1C-13: title', 'e2-1c-13'],
    ['E2-WEB-9: title', 'e2-web-9'],
    // Cyrillic look-alikes: U+0415 (E) and U+0421 (C).
    ['\u04152: Epic', '\u04352'],
    ['\u04152-1\u0421-13: title', '\u04352-1\u0441-13'],
  ])('extracts %s', (name, expected) => {
    expect(extractTicketId(name)).toBe(expected);
  });

  it('does not treat a free-form colon as a ticket id', () => {
    expect(extractTicketId('Reminder: check deployment')).toBeNull();
  });

  it('matches a renamed epic-scoped card by stable id', () => {
    expect(
      sameCardIdentity(
        'E2-1C-13: Old title',
        'E2-1C-13: New title',
      ),
    ).toBe(true);
  });

  it('does not equate a Latin id with its Cyrillic look-alike', () => {
    expect(sameCardIdentity('E2: Epic', '\u04152: Epic')).toBe(false);
  });

  it('falls back to exact normalized name for non-ticket cards', () => {
    expect(sameCardIdentity(' Loose note ', 'loose NOTE')).toBe(true);
    expect(sameCardIdentity('Loose note', 'Another note')).toBe(false);
  });
});
