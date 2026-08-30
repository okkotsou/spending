/**
 * Category picker.
 *
 * A native select: it is the only control that gives a correct, accessible,
 * scrollable list on iOS without building one, and the category set is short
 * enough that a searchable combobox would be ceremony.
 */
import { useI18n } from '@/i18n';
import type { Category } from '@/types';
import { categoryName, sortCategories } from '@/lib/category';
import { Select } from './ui/primitives';

export function CategorySelect({
  categories,
  value,
  onChange,
  id,
  includeAll = false,
  allLabel,
  disabled = false,
  ariaLabel,
}: {
  categories: readonly Category[];
  value: string;
  onChange: (categoryId: string) => void;
  id?: string;
  includeAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { language, t } = useI18n();
  const sorted = sortCategories(categories);
  const byParent = new Map<string, Category[]>();
  const roots: Category[] = [];
  for (const category of sorted) {
    if (category.parentId) {
      const bucket = byParent.get(category.parentId) ?? [];
      bucket.push(category);
      byParent.set(category.parentId, bucket);
    } else roots.push(category);
  }

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {includeAll ? <option value="">{allLabel ?? t('common.all')}</option> : null}
      {roots.map((category) => {
        const children = byParent.get(category.id) ?? [];
        const label = categoryName(category, language, t('common.uncategorised'));
        if (children.length === 0) {
          return (
            <option key={category.id} value={category.id}>
              {label}
            </option>
          );
        }
        return (
          <optgroup key={category.id} label={label}>
            <option value={category.id}>{label}</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {categoryName(child, language, t('common.uncategorised'))}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
