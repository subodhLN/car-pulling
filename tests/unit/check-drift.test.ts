import { describe, expect, it } from 'vitest';
import { unexpectedDrift } from '../../scripts/check-drift';

describe('unexpectedDrift', () => {
  it('ignores the known GiST drops and comments', () => {
    expect(unexpectedDrift('-- DropIndex\nDROP INDEX "trip_origin_gix";\n\n-- DropIndex\nDROP INDEX "trip_dest_gix";\n')).toEqual([]);
  });

  it('reports any other statement', () => {
    expect(unexpectedDrift('DROP INDEX "trip_dest_gix";\nALTER TABLE "Trip" ADD COLUMN "x" INT;')).toEqual([
      'ALTER TABLE "Trip" ADD COLUMN "x" INT;',
    ]);
  });
});
