// Applies every prisma/migrations/*/migration.sql, in order, using plain `pg`.
// Only for environments where the Prisma schema engine cannot run (e.g. a
// network-restricted sandbox). CI and normal development use
// `npx prisma migrate deploy`, which is the real thing.
//
// Usage: DATABASE_URL=postgresql://... node test/support/apply-migrations.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  if (!/localhost|127\.0\.0\.1|test/i.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL does not look like a local/disposable test database');
  }
  const dir = path.join(__dirname, '../../prisma/migrations');
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const client = new Client({ connectionString: url });
  await client.connect();
  for (const name of names) {
    const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`FAILED migration ${name}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(`Applied ${names.length} migrations`);
  await client.end();
})();
