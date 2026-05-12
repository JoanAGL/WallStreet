const { execSync } = require('child_process');

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.warn('[prisma-migrate] Skipping: DATABASE_URL or DIRECT_URL not available at build time.');
  process.exit(0);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
