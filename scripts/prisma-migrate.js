const { execSync } = require('child_process');

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.warn('[prisma-migrate] Skipping: DATABASE_URL or DIRECT_URL not available at build time.');
  process.exit(0);
}

try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
} catch (err) {
  console.warn('[prisma-migrate] Migration failed — continuing build. Apply pending migrations manually in Supabase if needed.');
  console.warn('[prisma-migrate] Error:', err.message);
  process.exit(0);
}
