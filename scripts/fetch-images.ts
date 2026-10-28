/**
 * Downloads the Unsplash photos the UI uses into public/images and writes
 * public/images/credits.json (rendered by /credits). The images are committed,
 * so this only needs re-running when the photo set changes:
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/fetch-images.ts   (proxy env var only needed behind a proxy)
 *
 * Only photo ids vetted in docs/design/home-mockup.html are used (Ruling R5).
 * Destinations without a photo fall back to a crop of the hero photo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Photo = {
  /** Path under public/, e.g. "images/cities/jaipur.jpg". */
  file: string;
  id: string;
  /** What the photo shows, for alt text and the credits page. */
  subject: string;
  width: number;
  height?: number;
};

const PHOTOS: Photo[] = [
  { file: 'images/hero.jpg', id: '1449965408869-eaa3f722e40d', subject: 'A driver’s hands on the wheel at dusk', width: 2000, height: 1125 },
  { file: 'images/trust.jpg', id: '1529156069898-49953e39b3ac', subject: 'Friends sitting arm in arm by the sea', width: 1400 },
  { file: 'images/cities/jaipur.jpg', id: '1599661046289-e31897846e41', subject: 'Jaipur — Amer Fort', width: 900, height: 1125 },
  { file: 'images/cities/agra.jpg', id: '1548013146-72479768bada', subject: 'Agra — Taj Mahal', width: 900, height: 1125 },
  { file: 'images/cities/amritsar.jpg', id: '1514222134-b57cbb8ce073', subject: 'Amritsar — Golden Temple', width: 900, height: 1125 },
  { file: 'images/cities/shimla.jpg', id: '1597074866923-dc0589150358', subject: 'Shimla — hillside houses', width: 900, height: 1125 },
];

export type Credit = { file: string; subject: string; unsplashUrl: string };

function downloadUrl(p: Photo): string {
  const size = p.height ? `w=${p.width}&h=${p.height}` : `w=${p.width}`;
  return `https://images.unsplash.com/photo-${p.id}?${size}&q=75&fm=jpg&fit=crop`;
}

async function main() {
  const publicDir = path.resolve(import.meta.dirname, '..', 'public');
  for (const p of PHOTOS) {
    const res = await fetch(downloadUrl(p));
    if (!res.ok) throw new Error(`${p.file}: HTTP ${res.status} from ${downloadUrl(p)}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const out = path.join(publicDir, p.file);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, bytes);
    console.log(`${p.file}  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  const credits: Credit[] = PHOTOS.map((p) => ({
    file: `/${p.file}`,
    subject: p.subject,
    unsplashUrl: `https://unsplash.com/photos/${p.id}`,
  }));
  await writeFile(path.join(publicDir, 'images', 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
  console.log(`images/credits.json  ${credits.length} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
