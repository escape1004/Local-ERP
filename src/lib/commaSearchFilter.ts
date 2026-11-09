import { defaultFilter } from 'cmdk';

export function splitCommaSearchTerms(search: string): string[] {
  return String(search || '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

export function commaAwareCommandFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const terms = splitCommaSearchTerms(search);
  if (terms.length === 0) return 1;

  return terms.reduce((best, term) => {
    const score = defaultFilter(value, term, keywords);
    return score > best ? score : best;
  }, 0);
}
