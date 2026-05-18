const { execSync } = require('child_process');

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.warn('[prisma-migrate] Skipping: DATABASE_URL or DIRECT_URL not set at build time.');
  process.exit(0);
}

// PgBouncer (transaction pooler, port 6543) does not support DDL migrations.
// Use DIRECT_URL (session pooler, port 5432) for this step only.
const originalUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = process.env.DIRECT_URL;

try {
  console.log('[prisma-migrate] Running migrations via DIRECT_URL (session pooler)...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[prisma-migrate] Migrations applied successfully.');
} catch (err) {
  console.warn('[prisma-migrate] Migration failed — build continues. Apply manually via Supabase SQL editor if needed.');
  console.warn('[prisma-migrate] Error:', err.message);
} finally {
  process.env.DATABASE_URL = originalUrl;
}
