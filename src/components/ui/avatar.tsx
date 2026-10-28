import { cn } from '@/lib/cn';

/** Six muted earth tones; all keep white initials above 4.5:1 contrast. */
export const AVATAR_TONES = ['#7a5c46', '#3f6b5e', '#5a5f8a', '#8a5150', '#646337', '#4b6577'] as const;

/** Deterministic tone for a name (FNV-1a hash), so a person always gets the same colour. */
export function avatarTone(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return AVATAR_TONES[(h >>> 0) % AVATAR_TONES.length];
}

/** First letter of the first and last word ("Rohit Kumar Sharma" → "RS"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : '';
  return (first + last).toUpperCase();
}

type AvatarProps = {
  name: string;
  image?: string | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
};

export function Avatar({ name, image, size = 32, className }: AvatarProps) {
  const box = { width: size, height: size };
  const classes = cn('inline-block flex-none rounded-full', className);

  if (image) {
    return (
      // Remote profile photos (e.g. Google) from arbitrary hosts; next/image would need every host allow-listed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        style={box}
        className={cn(classes, 'bg-soft object-cover')}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={{ ...box, backgroundColor: avatarTone(name), fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={cn(classes, 'grid place-items-center leading-none font-bold text-white select-none')}
    >
      {initials(name)}
    </span>
  );
}
