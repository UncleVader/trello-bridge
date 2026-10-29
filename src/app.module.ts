import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { TrelloModule } from './trello/trello.module';
import { loadDotenvUpwards, validateEnv } from './config/env';

// Must run before the @Module decorator below: ConfigModule.forRoot()
// executes at import time, so .env has to be in process.env already.
loadDotenvUpwards(__dirname);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env files are loaded above (walk-up from the project root);
      // here we only validate process.env.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    TrelloModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
