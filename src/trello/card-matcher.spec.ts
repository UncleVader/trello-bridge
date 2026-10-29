import {
  AmbiguousMatchError,
  matchByName,
  NoMatchError,
} from './card-matcher';

const cards = [
  { name: 'FB-1: Scaffold backend' },
  { name: 'FB-2: Auth module' },
  { name: 'FB-10: Email subsystem' },
  { name: 'FF-2: Login screen' },
  { name: 'FF-2.1: Google SSO' },
  { name: 'FF-2.2: Password reset entry points' },
];

describe('matchByName', () => {
  it('resolves an exact prefix match', () => {
    expect(matchByName(cards, 'FB-2').name).toBe('FB-2: Auth module');
  });

  it('is case-insensitive and trims the query', () => {
    expect(matchByName(cards, '  fb-10 ').name).toBe(
      'FB-10: Email subsystem',
    );
  });

  it('falls back to substring matching when no prefix matches', () => {
    expect(matchByName(cards, 'Google').name).toBe('FF-2.1: Google SSO');
  });

  it('prefers prefix matches over substring matches', () => {
    // "FF-2" prefixes FF-2, FF-2.1 and FF-2.2 → ambiguous, but the point is
    // it must not silently pick one.
    expect(() => matchByName(cards, 'FF-2')).toThrow(AmbiguousMatchError);
  });

  it('resolves sub-ticket queries unambiguously', () => {
    expect(matchByName(cards, 'FF-2.1').name).toBe('FF-2.1: Google SSO');
  });

  it('throws NoMatchError listing all candidates when nothing matches', () => {
    expect(() => matchByName(cards, 'FB-99')).toThrow(NoMatchError);
    try {
      matchByName(cards, 'FB-99');
    } catch (err) {
      expect((err as NoMatchError).candidates).toHaveLength(cards.length);
    }
  });

  it('throws AmbiguousMatchError listing only the conflicting names', () => {
    try {
      matchByName(cards, 'FF-2');
    } catch (err) {
      expect((err as AmbiguousMatchError).candidates).toEqual([
        'FF-2: Login screen',
        'FF-2.1: Google SSO',
        'FF-2.2: Password reset entry points',
      ]);
    }
  });

  describe('exact match among ambiguous prefix matches', () => {
    const checklists = [
      { name: 'Build' },
      { name: 'Build v2 (Cryptomus)' },
    ];

    it('prefers the exact match instead of throwing AmbiguousMatchError', () => {
      expect(matchByName(checklists, 'Build').name).toBe('Build');
    });

    it('is case-insensitive and trims the query for the exact-match check too', () => {
      expect(matchByName(checklists, '  build  ').name).toBe('Build');
    });

    it('still throws AmbiguousMatchError when no candidate is an exact match', () => {
      // "uild" substring-matches both ("Build" and "Build v2 (Cryptomus)")
      // and is an exact match for neither.
      expect(() => matchByName(checklists, 'uild')).toThrow(
        AmbiguousMatchError,
      );
    });

    it('still throws AmbiguousMatchError when more than one candidate is an exact match', () => {
      const duplicates = [{ name: 'Build' }, { name: 'Build' }];
      expect(() => matchByName(duplicates, 'Build')).toThrow(
        AmbiguousMatchError,
      );
    });
  });
});
