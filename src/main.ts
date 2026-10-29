import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // .env is loaded in app.module.ts, before ConfigModule.forRoot runs.
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  const port = Number(process.env.PORT ?? 4646);
  // Deliberately localhost-only: this bridge has no auth of its own and
  // proxies write access to the Trello board. HOST exists solely for
  // Docker, where the process must bind 0.0.0.0 *inside* the container —
  // there the port is published as 127.0.0.1:4646:4646, so it is still
  // unreachable from outside the host. Never expose HOST=0.0.0.0 directly.
  const host = process.env.HOST ?? '127.0.0.1';
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`trello-bridge listening on http://${host}:${port}`);
}

void bootstrap();
