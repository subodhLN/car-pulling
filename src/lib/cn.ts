/** Join class names, skipping falsy parts. Later classes do not override earlier ones by specificity. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
