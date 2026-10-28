/**
 * Fails when prisma/schema.prisma and prisma/migrations disagree, ignoring the hand-maintained
 * GiST indexes Prisma cannot model (see prisma/README.md). Needs SHADOW_DATABASE_URL (it is wiped).
 */
import { execFileSync } from 'node:child_process';

// Prisma always proposes dropping these; they are created by hand in the init migration.
export const KNOWN_FALSE_POSITIVES = ['DROP INDEX "trip_origin_gix";', 'DROP INDEX "trip_dest_gix";'];

export function unexpectedDrift(sql: string): string[] {
  return sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--') && !KNOWN_FALSE_POSITIVES.includes(l));
}

function main() {
  const shadow = process.env.SHADOW_DATABASE_URL;
  if (!shadow) {
    console.error('SHADOW_DATABASE_URL is not set (a scratch database; it will be wiped).');
    process.exit(2);
  }
  const sql = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      'prisma/migrations',
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--shadow-database-url',
      shadow,
      '--script',
    ],
    { encoding: 'utf8' },
  );
  const drift = unexpectedDrift(sql);
  if (drift.length) {
    console.error('Schema drift between schema.prisma and migrations:\n' + drift.join('\n'));
    process.exit(1);
  }
  console.log('No schema drift.');
}

if (process.argv[1]?.endsWith('check-drift.ts')) main();
