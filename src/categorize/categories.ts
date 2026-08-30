/**
 * The seeded category set.
 *
 * Colours come from the sixteen-swatch earthy palette fixed in DESIGN.md:
 * matched chroma, no spectrum, readable as chart marks at 14 percent alpha for
 * chips. Icons are Lucide names, resolved once in `src/components/ui/Icon.tsx`.
 *
 * Seeded categories are `builtin`: they can be renamed, recoloured and merged,
 * but not deleted, so a transaction can never point at nothing.
 */
import type { Category } from '@/types';

export const OTHER_CATEGORY_ID = 'other';
export const TRANSFERS_CATEGORY_ID = 'transfers';
export const CASH_CATEGORY_ID = 'cash';

interface Seed {
  id: string;
  en: string;
  ar: string;
  color: string;
  icon: string;
}

const SEEDS: Seed[] = [
  { id: 'restaurants', en: 'Restaurants and cafes', ar: 'مطاعم ومقاهي', color: '#B4553C', icon: 'utensils' },
  { id: 'groceries', en: 'Groceries', ar: 'بقالة وتموين', color: '#6D8B3C', icon: 'shopping-basket' },
  { id: 'fuel', en: 'Fuel', ar: 'وقود', color: '#A87C2E', icon: 'fuel' },
  { id: 'transport', en: 'Transport', ar: 'مواصلات', color: '#3F7C8C', icon: 'bus' },
  { id: 'shopping', en: 'Shopping', ar: 'تسوق', color: '#9C5578', icon: 'shopping-bag' },
  { id: 'bills', en: 'Bills and utilities', ar: 'فواتير وخدمات', color: '#7B6E5E', icon: 'receipt' },
  { id: 'telecom', en: 'Telecom and internet', ar: 'اتصالات وإنترنت', color: '#4A8073', icon: 'wifi' },
  { id: 'health', en: 'Health and pharmacy', ar: 'صحة وصيدلية', color: '#B04A45', icon: 'heart-pulse' },
  { id: 'entertainment', en: 'Entertainment and games', ar: 'ترفيه وألعاب', color: '#5B6FA0', icon: 'gamepad' },
  { id: 'subscriptions', en: 'Subscriptions', ar: 'اشتراكات', color: '#806BA3', icon: 'repeat' },
  { id: 'education', en: 'Education', ar: 'تعليم', color: '#37776A', icon: 'graduation-cap' },
  { id: 'travel', en: 'Travel', ar: 'سفر', color: '#C07A3E', icon: 'plane' },
  { id: 'home', en: 'Home', ar: 'المنزل', color: '#8A7C4E', icon: 'house' },
  { id: 'family', en: 'Family and gifts', ar: 'العائلة والهدايا', color: '#A85C63', icon: 'gift' },
  { id: 'transfers', en: 'Transfers', ar: 'تحويلات', color: '#6B7280', icon: 'arrow-left-right' },
  { id: 'cash', en: 'Cash', ar: 'نقد', color: '#5F7A5A', icon: 'banknote' },
  { id: 'other', en: 'Other', ar: 'أخرى', color: '#8A857D', icon: 'circle-dashed' },
];

export function defaultCategories(): Category[] {
  return SEEDS.map((seed, index) => ({
    id: seed.id,
    nameEn: seed.en,
    nameAr: seed.ar,
    color: seed.color,
    icon: seed.icon,
    builtin: true,
    order: index,
  }));
}

/** The palette offered when the user creates or recolours a category. */
export const CATEGORY_PALETTE: string[] = [
  '#B4553C',
  '#C07A3E',
  '#A87C2E',
  '#8A7C4E',
  '#6D8B3C',
  '#5F7A5A',
  '#37776A',
  '#4A8073',
  '#3F7C8C',
  '#5B6FA0',
  '#806BA3',
  '#9C5578',
  '#A85C63',
  '#B04A45',
  '#7B6E5E',
  '#6B7280',
];
