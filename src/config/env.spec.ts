import { validateEnv } from './env';

describe('validateEnv', () => {
  const base = { TRELLO_KEY: 'k', TRELLO_TOKEN: 't' };

  it('applies default for port', () => {
    const env = validateEnv(base as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4646);
  });

  it('coerces PORT to a number', () => {
    const env = validateEnv({ ...base, PORT: '5000' } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(5000);
  });

  it('fails fast on missing credentials', () => {
    expect(() => validateEnv({} as NodeJS.ProcessEnv)).toThrow(
      /TRELLO_KEY/,
    );
  });

  it('rejects a non-numeric port', () => {
    expect(() =>
      validateEnv({ ...base, PORT: 'abc' } as NodeJS.ProcessEnv),
    ).toThrow(/PORT/);
  });
});
