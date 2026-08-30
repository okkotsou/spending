/**
 * Translation and direction.
 *
 * The language choice drives three things at once: the strings, the document
 * direction, and the locale used for numbers and dates. They are set together
 * on `<html>` so CSS logical properties, Intl formatting and the strings can
 * never disagree.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { Language } from '@/types';
import { en, enPlurals, type TranslationKey } from './en';
import { ar } from './ar';

const TABLES: Record<Language, Record<TranslationKey, string>> = { en, ar };

/**
 * Plural variants, by language. Only English has any: Arabic strings are
 * written to read correctly at every count without them.
 */
const PLURALS: Partial<
  Record<Language, Partial<Record<`${TranslationKey}#${Intl.LDMLPluralRule}`, string>>>
> = { en: enPlurals };

const pluralRules = new Map<Language, Intl.PluralRules>();

function selectPlural(language: Language, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language === 'ar' ? 'ar' : 'en');
    pluralRules.set(language, rules);
  }
  return rules.select(count);
}

export type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string;

interface I18nValue {
  language: Language;
  dir: 'rtl' | 'ltr';
  locale: string;
  t: Translate;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const t = useCallback<Translate>(
    (key, values) => {
      let template = TABLES[language][key] ?? en[key] ?? key;
      const count = values?.count;
      if (typeof count === 'number') {
        const variant =
          PLURALS[language]?.[`${key}#${selectPlural(language, count)}` as keyof typeof enPlurals];
        if (variant !== undefined) template = variant;
      }
      return interpolate(template, values);
    },
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({
      language,
      dir: language === 'ar' ? 'rtl' : 'ltr',
      // Arabic with Latin digits: the app uses tabular lining figures
      // throughout, and mixing digit systems would break column alignment.
      locale: language === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB',
      t,
    }),
    [language, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export type { TranslationKey };
