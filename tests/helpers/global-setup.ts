import { execSync } from 'node:child_process';

/** Apply migrations to the test database (DATABASE_URL already points at it). */
export default function setup(): void {
  const testUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      DIRECT_URL: testUrl,
    },
  });
}
