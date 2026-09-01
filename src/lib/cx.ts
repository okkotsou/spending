/** Joins class names, dropping anything falsy. */
export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
}
