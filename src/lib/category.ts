/**
 * Category display helpers.
 *
 * A category carries both names so the label follows the interface language
 * without a translation lookup, and user-created categories work in both.
 */
import type { Category, Language } from '@/types';

export function categoryName(
  category: Category | undefined,
  language: Language,
  fallback: string,
): string {
  if (!category) return fallback;
  const preferred = language === 'ar' ? category.nameAr : category.nameEn;
  return preferred.trim().length > 0
    ? preferred
    : (language === 'ar' ? category.nameEn : category.nameAr) || fallback;
}

export function categoryColor(category: Category | undefined): string {
  return category?.color ?? '#8A857D';
}

/** Seeded categories sort first, then user categories, both by their order. */
export function sortCategories(categories: readonly Category[]): Category[] {
  return [...categories].sort((a, b) => a.order - b.order);
}
