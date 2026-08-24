import { PrismaClient } from '@prisma/client';

// Creates the application database if missing. Idempotent.

async function main() {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  // Connect via the postgres maintenance database
  const parsed = new URL(appUrl);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  if (!dbName) {
    throw new Error(`DATABASE_URL has no database name: ${parsed.pathname}`);
  }
  // Interpolated into DDL below
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error(
      `Refusing to create a database with a non-identifier name: "${dbName}".`,
    );
  }

  if (dbName === 'postgres') {
    console.log('DATABASE_URL already targets `postgres`; nothing to create.');
    return;
  }

  parsed.pathname = '/postgres';
  const adminUrl = parsed.toString();

  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    const rows = await admin.$queryRawUnsafe<{ found: number }[]>(
      'SELECT count(*)::int AS found FROM pg_database WHERE datname = $1',
      dbName,
    );

    if (rows[0]?.found > 0) {
      console.log(`Database "${dbName}" already exists. Nothing to do.`);
      return;
    }

    console.log(`Database "${dbName}" not found. Creating it...`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}".`);
  } catch (e: any) {
    // 42P04: created concurrently
    const code = e?.meta?.code ?? e?.code;
    if (code === '42P04' || /already exists/i.test(String(e?.message))) {
      console.log(`Database "${dbName}" was created concurrently. Continuing.`);
      return;
    }
    throw e;
  } finally {
    await admin.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // Fail the deployment
    console.error('ensure-database failed:', e);
    process.exit(1);
  });
