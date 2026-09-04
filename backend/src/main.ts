import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request } from 'express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';

// The public form submission endpoint is reached directly by external
// marketing websites, so it needs its own, stricter CORS policy than the
// rest of the (already-authenticated) app — env-driven allowlist, fail
// closed if PUBLIC_FORM_CORS_ORIGINS is unset (no origin allowed) rather
// than accidentally wide open. Nest's enableCors() only accepts one policy
// per app, but does accept a per-request delegate, which is what lets this
// one path diverge from the wide-open `origin: true` every other route
// keeps relying on.
const publicFormOrigins = new Set(
  (process.env.PUBLIC_FORM_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const PUBLIC_FORMS_PATH_PREFIX = '/api/v1/public/forms';

function corsOptionsDelegate(req: Request, callback: (err: Error | null, options: CorsOptions) => void) {
  if (req.url.startsWith(PUBLIC_FORMS_PATH_PREFIX)) {
    const origin = req.headers.origin;
    const allowed = Boolean(origin && publicFormOrigins.has(origin));
    callback(null, { origin: allowed, methods: ['POST', 'OPTIONS'], credentials: false });
    return;
  }
  callback(null, { origin: true, credentials: true });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Bulk imports exceed the 100 KB default
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });

  app.enableCors(corsOptionsDelegate);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('DailyOps API')
    .setDescription('DailyOps backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 4000;
  // All interfaces (container)
  await app.listen(port, '0.0.0.0');
  console.log(`DailyOps backend running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
