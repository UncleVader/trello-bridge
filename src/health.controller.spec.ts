import { HealthController } from './health.controller';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports ok status and the package version with no board header', () => {
    expect(controller.health(undefined)).toEqual({
      status: 'ok',
      version,
      board: null,
    });
  });

  it('echoes a decoded board header alongside the version', () => {
    expect(controller.health(encodeURIComponent('Café board ✓'))).toEqual({
      status: 'ok',
      version,
      board: 'Café board ✓',
    });
  });
});
