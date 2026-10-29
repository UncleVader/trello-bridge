import { parseCardRef } from './card-ref';

describe('parseCardRef', () => {
  it('treats an 8-character shortLink as a card id', () => {
    expect(parseCardRef('dKOgYxWs')).toEqual({ kind: 'id', id: 'dKOgYxWs' });
    expect(parseCardRef('  8cCcSnl5  ')).toEqual({ kind: 'id', id: '8cCcSnl5' });
  });

  it('extracts the shortLink from a card URL, including a slug', () => {
    expect(parseCardRef('https://trello.com/c/dKOgYxWs')).toEqual({
      kind: 'id',
      id: 'dKOgYxWs',
    });
    expect(
      parseCardRef('https://trello.com/c/dKOgYxWs/12-some-card'),
    ).toEqual({ kind: 'id', id: 'dKOgYxWs' });
    expect(parseCardRef('https://www.trello.com/c/8cCcSnl5?foo=1')).toEqual({
      kind: 'id',
      id: '8cCcSnl5',
    });
    expect(parseCardRef('trello.com/c/dKOgYxWs')).toEqual({
      kind: 'id',
      id: 'dKOgYxWs',
    });
  });

  it('decodes a percent-encoded card URL before extracting the shortLink', () => {
    const encoded = encodeURIComponent(
      'https://trello.com/c/dKOgYxWs/12-some-card',
    );
    expect(parseCardRef(encoded)).toEqual({ kind: 'id', id: 'dKOgYxWs' });
  });

  it('treats a 24-hex card id as an id', () => {
    const id = '5abbe4b7ddc1b351ef961414';
    expect(parseCardRef(id)).toEqual({ kind: 'id', id });
  });

  it('keeps ordinary names, including ambiguous ticket prefixes, as names', () => {
    expect(parseCardRef('FB-2')).toEqual({ kind: 'name', name: 'FB-2' });
    expect(parseCardRef('FB-2.1')).toEqual({ kind: 'name', name: 'FB-2.1' });
    expect(parseCardRef('E2-1C-13')).toEqual({
      kind: 'name',
      name: 'E2-1C-13',
    });
    expect(parseCardRef('dKOgYxW')).toEqual({ kind: 'name', name: 'dKOgYxW' });
    expect(parseCardRef('dKOgYxWsX')).toEqual({
      kind: 'name',
      name: 'dKOgYxWsX',
    });
  });
});
