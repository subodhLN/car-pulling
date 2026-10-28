import { db } from '@/lib/db';

/** Truncate every application table (test database only). */
export async function resetDb(): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
