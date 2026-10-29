import { Controller, Get, Headers } from '@nestjs/common';
import { decodeBoardHeader } from './trello/board-header';

// Not copied through `resolveJsonModule` — a plain `require` so the same
// path resolves both under ts-node (src/health.controller.ts, one level
// above package.json) and in the compiled Docker image (dist/health.controller.js,
// where the Dockerfile now also copies package.json one level up).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

@Controller('health')
export class HealthController {
  /**
   * Liveness probe — always `200`, no `X-Trello-Board` required, so the
   * Docker `HEALTHCHECK` (which calls this with no headers) keeps working.
   * `version` is the bridge's own `package.json` version, so a caller can
   * tell which build is actually running without shelling into the
   * container. `board` echoes the header when the caller sends one,
   * otherwise `null` — the bridge itself has no default/configured board
   * to fall back to.
   */
  @Get()
  health(@Headers('x-trello-board') board?: string) {
    return {
      status: 'ok',
      version,
      board: decodeBoardHeader(board)?.trim() || null,
    };
  }
}
