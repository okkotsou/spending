/**
 * The fixture corpus.
 *
 * Realistic Saudi bank and wallet messages in both languages, written the way
 * the banks actually write them: mixed digit systems, inconsistent labels,
 * balances tacked onto purchase alerts, dates in four different layouts. Each
 * entry states exactly what the parser must produce, so a regression in one
 * rule cannot hide behind another.
 *
 * `expect: null` means the message must be rejected rather than guessed at.
 */
import type { TxKind } from '@/types';
import type { ParseFailureReason } from '@/types';

export interface FixtureExpectation {
  kind: TxKind;
  amount: number;
  currency?: string;
  merchant?: string;
  merchantKey?: string;
  last4?: string;
  institution?: string;
  fxAmount?: number;
  fxCurrency?: string;
  /** Local calendar date and time the message states, as `YYYY-MM-DD HH:mm`. */
  at?: string;
  /** Whether the message stated a clock time, as opposed to a date alone. */
  timeKnown?: boolean;
  needsReview?: boolean;
}

export interface Fixture {
  id: string;
  note: string;
  text: string;
  expect: FixtureExpectation | null;
  /** Required when `expect` is null. */
  reason?: ParseFailureReason;
  /** Simulated arrival time for messages that carry no date. */
  receivedAt?: string;
}

/** Every fixture is parsed with this as "now", so results are deterministic. */
export const FIXTURE_NOW = '2024-06-20 12:00';

export const FIXTURES: Fixture[] = [
  {
    id: 'alrajhi-ar-online-applepay',
    note: 'Al Rajhi online purchase through Apple Pay, labelled fields, yy-mm-dd date',
    text: `شراء انترنت
مدى-أبل باي
بطاقة:4560*;مدى
من:حساب SA..1234
لدى:AMAZON SA
بمبلغ:SAR 214.50
في:24-06-12 19:33`,
    expect: {
      kind: 'purchase',
      amount: 214.5,
      merchant: 'Amazon',
      last4: '4560',
      institution: 'applepay',
      at: '2024-06-12 19:33',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'alrajhi-en-pos',
    note: 'Al Rajhi English point of sale, same layout in Latin labels',
    text: `Purchase
Card:4560*;mada
From:SA..1234
At:JARIR BOOKSTORE
Amount:SAR 349.00
On:24-06-12 19:33`,
    expect: {
      kind: 'purchase',
      amount: 349,
      merchant: 'Jarir Bookstore',
      last4: '4560',
      at: '2024-06-12 19:33',
      needsReview: false,
    },
  },
  {
    id: 'snb-ar-pos',
    note: 'SNB point of sale, Arabic merchant, yyyy/mm/dd date',
    text: `البنك الأهلي السعودي
شراء نقاط بيع
الحساب: ****4321
المبلغ: 87.40 ريال
لدى: تميمي ماركتس
التاريخ: 2024/06/12 18:02`,
    expect: {
      kind: 'purchase',
      amount: 87.4,
      merchant: 'تميمي ماركتس',
      last4: '4321',
      institution: 'snb',
      at: '2024-06-12 18:02',
      needsReview: false,
    },
  },
  {
    id: 'riyad-ar-mada',
    note: 'Riyad Bank mada purchase, unlabelled amount separator, dd/mm/yyyy',
    text: `بنك الرياض
عملية شراء بواسطة مدى
البطاقة *2210
المبلغ SAR 45.00
التاجر KUDU
التاريخ 12/06/2024 13:10`,
    expect: {
      kind: 'purchase',
      amount: 45,
      merchant: 'Kudu',
      last4: '2210',
      institution: 'riyad',
      at: '2024-06-12 13:10',
      needsReview: false,
    },
  },
  {
    id: 'alinma-ar-online',
    note: 'Alinma online purchase, thousands separator, ر.س symbol, dd-mm-yyyy',
    text: `الإنماء
شراء عبر الإنترنت
مبلغ: 1,250.00 ر.س
لدى: NOON.COM
البطاقة: 1122*
بتاريخ: 12-06-2024 09:45`,
    expect: {
      kind: 'purchase',
      amount: 1250,
      merchant: 'Noon.com',
      last4: '1122',
      institution: 'alinma',
      at: '2024-06-12 09:45',
      needsReview: false,
    },
  },
  {
    id: 'stcpay-ar-with-balance',
    note: 'STC Pay wallet purchase that also reports the remaining balance',
    text: `stc pay
تم شراء بمبلغ 32.00 ريال
من HUNGERSTATION
الرصيد المتبقي 418.20 ريال
12/06/2024 21:05`,
    expect: {
      kind: 'purchase',
      amount: 32,
      merchant: 'Hungerstation',
      institution: 'stcpay',
      at: '2024-06-12 21:05',
      needsReview: false,
    },
  },
  {
    id: 'stcbank-ar-pos',
    note: 'STC Bank card purchase with a masked card and a bare date line',
    text: `stc bank
عملية شراء
المبلغ: 76.50 SAR
التاجر: STARBUCKS
البطاقة: *7788
12/06/2024 08:12`,
    expect: {
      kind: 'purchase',
      amount: 76.5,
      merchant: 'Starbucks',
      last4: '7788',
      institution: 'stcbank',
      at: '2024-06-12 08:12',
      needsReview: false,
    },
  },
  {
    id: 'applepay-en-bare',
    note: 'Apple Pay notification: no labels, no date, merchant on its own line',
    text: `Apple Pay
JARIR BOOKSTORE
SAR 349.00
Visa ...4560`,
    receivedAt: '2024-06-12 19:34',
    expect: {
      kind: 'purchase',
      amount: 349,
      merchant: 'Jarir Bookstore',
      last4: '4560',
      institution: 'applepay',
      at: '2024-06-12 19:34',
      needsReview: true,
    },
  },
  {
    id: 'alrajhi-ar-atm',
    note: 'ATM withdrawal, no merchant by nature',
    text: `سحب نقدي
الصراف الآلي
المبلغ: 500.00 ريال
الحساب: ****4321
التاريخ: 12/06/2024 17:20`,
    expect: {
      kind: 'atm_withdrawal',
      amount: 500,
      merchant: '',
      last4: '4321',
      at: '2024-06-12 17:20',
      needsReview: false,
    },
  },
  {
    id: 'transfer-out-ar',
    note: 'Outgoing transfer to a person, date without a time',
    text: `حوالة صادرة
المبلغ: 1,000.00 ريال
إلى: MOHAMMED A
الحساب: ****4321
التاريخ: 12/06/2024`,
    expect: {
      kind: 'transfer_out',
      amount: 1000,
      merchant: 'Mohammed A',
      last4: '4321',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'transfer-in-ar',
    note: 'Incoming transfer with no date at all, falls back to arrival time',
    text: `حوالة واردة
المبلغ: 500.00 ريال
من: FATIMAH S
الحساب: ****4321`,
    receivedAt: '2024-06-13 10:15',
    expect: {
      kind: 'transfer_in',
      amount: 500,
      merchant: 'Fatimah S',
      last4: '4321',
      at: '2024-06-13 10:15',
      needsReview: false,
    },
  },
  {
    id: 'salary-ar',
    note: 'Salary deposit from a named employer on payday',
    text: `إيداع راتب
المبلغ: 14,500.00 ريال
من: شركة الاتصالات السعودية
الحساب: ****4321
التاريخ: 27/05/2024`,
    expect: {
      kind: 'salary',
      amount: 14500,
      merchant: 'شركة الاتصالات',
      last4: '4321',
      at: '2024-05-27 00:00',
      needsReview: false,
    },
  },
  {
    id: 'salary-en',
    note: 'English salary credit, merchant absent by nature',
    text: 'Salary credit SAR 14,500.00 to account ending 4321 on 27/05/2024',
    expect: {
      kind: 'salary',
      amount: 14500,
      merchant: '',
      last4: '4321',
      at: '2024-05-27 00:00',
      needsReview: false,
    },
  },
  {
    id: 'refund-ar',
    note: 'Arabic refund that must cancel an earlier purchase, not count as income',
    text: `استرجاع مبلغ
المبلغ: 214.50 ريال
لدى: AMAZON SA
البطاقة: 4560*
التاريخ: 15/06/2024`,
    expect: {
      kind: 'refund',
      amount: 214.5,
      merchant: 'Amazon',
      last4: '4560',
      at: '2024-06-15 00:00',
      needsReview: false,
    },
  },
  {
    id: 'refund-en-inline',
    note: 'English refund written as one sentence',
    text: 'Refund of SAR 349.00 at JARIR BOOKSTORE to card ending 4560 on 16/06/2024',
    expect: {
      kind: 'refund',
      amount: 349,
      merchant: 'Jarir Bookstore',
      last4: '4560',
      at: '2024-06-16 00:00',
      needsReview: false,
    },
  },
  {
    id: 'reversal-ar',
    note: 'Reversal wording rather than refund wording',
    text: `عملية عكسية
المبلغ: 45.00 ريال
لدى: KUDU
البطاقة: 2210*
التاريخ: 14/06/2024`,
    expect: {
      kind: 'refund',
      amount: 45,
      merchant: 'Kudu',
      last4: '2210',
      at: '2024-06-14 00:00',
      needsReview: false,
    },
  },
  {
    id: 'subscription-ar',
    note: 'Arabic subscription renewal',
    text: `تجديد اشتراك
المبلغ: 21.99 ر.س
لدى: SPOTIFY
البطاقة: 4560*
التاريخ: 12/06/2024`,
    expect: {
      kind: 'subscription',
      amount: 21.99,
      merchant: 'Spotify',
      last4: '4560',
      at: '2024-06-12 00:00',
      timeKnown: false,
      needsReview: false,
    },
  },
  {
    id: 'subscription-en',
    note: 'English subscription renewal written inline',
    text: 'Subscription renewal at SHAHID VIP, SAR 34.50, card 4560, 12/06/2024',
    expect: {
      kind: 'subscription',
      amount: 34.5,
      merchant: 'Shahid Vip',
      last4: '4560',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'fee-ar',
    note: 'Bank service fee',
    text: `رسوم خدمة
المبلغ: 5.75 ريال
الحساب: ****4321
التاريخ: 12/06/2024`,
    expect: {
      kind: 'fee',
      amount: 5.75,
      merchant: '',
      last4: '4321',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'fee-en',
    note: 'English service fee, must not be read as a transfer',
    text: 'Service fee SAR 25.00 charged to account ending 4321 on 12/06/2024',
    expect: {
      kind: 'fee',
      amount: 25,
      last4: '4321',
      at: '2024-06-12 00:00',
    },
  },
  {
    id: 'deposit-ar',
    note: 'Cash deposit at a branch',
    text: `إيداع نقدي
المبلغ: 2,000.00 ريال
الحساب: ****4321
التاريخ: 12/06/2024 11:30`,
    expect: {
      kind: 'deposit',
      amount: 2000,
      merchant: '',
      last4: '4321',
      at: '2024-06-12 11:30',
      needsReview: false,
    },
  },
  {
    id: 'fx-en-both-legs',
    note: 'Foreign currency purchase reporting both the USD and the SAR leg',
    text: `Purchase
Card:4560*;Visa
At:NETFLIX.COM
Amount:USD 15.49
Amount in SAR:58.10
On:24-06-12`,
    expect: {
      kind: 'purchase',
      amount: 58.1,
      currency: 'SAR',
      fxAmount: 15.49,
      fxCurrency: 'USD',
      merchant: 'Netflix.com',
      last4: '4560',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'fx-ar-both-legs',
    note: 'Arabic foreign currency purchase with the riyal equivalent',
    text: `شراء عبر الإنترنت
المبلغ: 15.49 دولار
المبلغ بالريال: 58.10
لدى: NETFLIX.COM
البطاقة: 4560*
التاريخ: 12/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 58.1,
      fxAmount: 15.49,
      fxCurrency: 'USD',
      merchant: 'Netflix.com',
      last4: '4560',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'fx-only-foreign',
    note: 'Foreign charge with no riyal leg: the SAR figure is unknown, flag it',
    text: `Purchase
Card:4560*;Visa
At:BOOKING.COM
Amount:AED 420.00
On:12/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 420,
      currency: 'AED',
      merchant: 'Booking.com',
      last4: '4560',
      at: '2024-06-12 00:00',
      needsReview: true,
    },
  },
  {
    id: 'arabic-indic-digits',
    note: 'Eastern Arabic numerals throughout, including the date and decimal mark',
    text: `شراء
المبلغ: ٢٣٤٫٥٠ ريال
لدى: بنده
التاريخ: ١٢/٠٦/٢٠٢٤`,
    expect: {
      kind: 'purchase',
      amount: 234.5,
      merchant: 'بنده',
      at: '2024-06-12 00:00',
      needsReview: false,
    },
  },
  {
    id: 'extended-arabic-indic-digits',
    note: 'Extended Arabic-Indic numerals, as some handsets render them',
    text: `شراء
المبلغ: ۷۵٫۰۰ ريال
لدى: الدانوب
التاريخ: ۱۳/۰۶/۲۰۲۴`,
    expect: {
      kind: 'purchase',
      amount: 75,
      merchant: 'الدانوب',
      at: '2024-06-13 00:00',
      needsReview: false,
    },
  },
  {
    id: 'diacritics-and-tatweel',
    note: 'Decorative elongation and diacritics must not defeat the rules',
    text: `شِراء
المبلـــغ: 19.00 ريال
لدى: كافيه بَرن
التاريخ: 13/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 19,
      at: '2024-06-13 00:00',
    },
  },
  {
    id: 'bare-labelled-amount',
    note: 'Amount with no currency token at all',
    text: `شراء نقاط بيع
المبلغ: 87.40
لدى: العثيم
التاريخ: 13/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 87.4,
      merchant: 'العثيم',
      at: '2024-06-13 00:00',
    },
  },
  {
    id: 'arabic-month-name',
    note: 'Date written with an Arabic month name',
    text: `شراء
المبلغ: 60.00 ريال
لدى: هرفي
بتاريخ: 12 يونيو 2024`,
    expect: {
      kind: 'purchase',
      amount: 60,
      merchant: 'هرفي',
      at: '2024-06-12 00:00',
    },
  },
  {
    id: 'english-month-name',
    note: 'Date written with an English month abbreviation and a 12-hour clock',
    text: `Purchase at DUNKIN, SAR 24.00
Card ending 4560
12 Jun 2024 08:05 AM`,
    expect: {
      kind: 'purchase',
      amount: 24,
      merchant: 'Dunkin',
      last4: '4560',
      at: '2024-06-12 08:05',
    },
  },
  {
    id: 'arabic-meridiem',
    note: 'Arabic afternoon marker on the clock time',
    text: `شراء
المبلغ: 33.00 ريال
لدى: بيك
التاريخ: 13/06/2024 07:30 م`,
    expect: {
      kind: 'purchase',
      amount: 33,
      merchant: 'بيك',
      at: '2024-06-13 19:30',
    },
  },
  {
    id: 'sadad-bill',
    note: 'SADAD bill payment, treated as an outgoing transfer',
    text: `سداد فاتورة
المبلغ: 320.00 ريال
لدى: شركة الكهرباء
الحساب: ****4321
التاريخ: 14/06/2024`,
    expect: {
      kind: 'transfer_out',
      amount: 320,
      merchant: 'شركة الكهرباء',
      at: '2024-06-14 00:00',
    },
  },
  {
    id: 'fuel-station-with-city',
    note: 'Acquirer string with a city suffix that must be trimmed off',
    text: `شراء
المبلغ: 150.00 ريال
لدى: SASCO STATION RIYADH
البطاقة: 4560*
التاريخ: 14/06/2024 07:12`,
    expect: {
      kind: 'purchase',
      amount: 150,
      merchant: 'Sasco Station',
      merchantKey: 'sasco station',
      at: '2024-06-14 07:12',
    },
  },
  {
    id: 'gateway-prefix',
    note: 'Payment gateway prefix must not become part of the merchant name',
    text: `Purchase
At:SQ *SALT BURGER
Amount:SAR 68.00
Card:4560*
On:14/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 68,
      merchant: 'Salt Burger',
      at: '2024-06-14 00:00',
    },
  },
  {
    id: 'terminal-reference-suffix',
    note: 'Trailing terminal number stripped from the merchant name',
    text: `شراء
المبلغ: 41.00 ريال
لدى: CARREFOUR 00231
البطاقة: 4560*
التاريخ: 14/06/2024`,
    expect: {
      kind: 'purchase',
      amount: 41,
      merchant: 'Carrefour',
      at: '2024-06-14 00:00',
    },
  },
  {
    id: 'urpay-wallet',
    note: 'urpay wallet purchase with no operation word beyond the wallet name',
    text: `urpay
NINJA
SAR 88.00`,
    receivedAt: '2024-06-14 20:00',
    expect: {
      kind: 'purchase',
      amount: 88,
      merchant: 'Ninja',
      institution: 'urpay',
      at: '2024-06-14 20:00',
      needsReview: true,
    },
  },
  {
    id: 'applepay-ar-bare',
    note: 'Arabic Apple Pay notification with the merchant on its own line',
    text: `أبل باي
قهوة الرياض
75.00 ريال`,
    receivedAt: '2024-06-14 09:30',
    expect: {
      kind: 'purchase',
      amount: 75,
      merchant: 'قهوة الرياض',
      institution: 'applepay',
      at: '2024-06-14 09:30',
      needsReview: true,
    },
  },
  {
    id: 'thousands-and-decimals',
    note: 'Five figure amount with a thousands separator',
    text: `شراء
المبلغ: 12,499.99 ريال
لدى: EXTRA STORES
البطاقة: 4560*
التاريخ: 15/06/2024 16:40`,
    expect: {
      kind: 'purchase',
      amount: 12499.99,
      merchant: 'Extra Stores',
      at: '2024-06-15 16:40',
    },
  },
  {
    id: 'vat-fee',
    note: 'Monthly account fee, must not be read as a purchase',
    text: `رسوم شهرية على الحساب
المبلغ: 15.00 ريال
الحساب: ****4321
التاريخ: 15/06/2024`,
    expect: {
      kind: 'fee',
      amount: 15,
      at: '2024-06-15 00:00',
    },
  },
  {
    id: 'atm-en',
    note: 'English ATM withdrawal',
    text: 'ATM withdrawal SAR 300.00 from account ending 4321 on 15/06/2024 22:10',
    expect: {
      kind: 'atm_withdrawal',
      amount: 300,
      last4: '4321',
      at: '2024-06-15 22:10',
    },
  },
  {
    id: 'deposit-en',
    note: 'English incoming credit',
    text: 'SAR 750.00 has been deposited to your account ending 4321 on 16/06/2024',
    expect: {
      kind: 'deposit',
      amount: 750,
      last4: '4321',
      at: '2024-06-16 00:00',
    },
  },
  {
    id: 'transfer-out-en',
    note: 'English outgoing transfer',
    text: 'Transfer to AHMED K of SAR 250.00 from account ending 4321 on 16/06/2024',
    expect: {
      kind: 'transfer_out',
      amount: 250,
      last4: '4321',
      at: '2024-06-16 00:00',
    },
  },
  {
    id: 'purchase-with-balance-en',
    note: 'English purchase alert that also reports the available balance',
    text: `Purchase at PANDA, SAR 212.30
Card ending 4560
Available balance SAR 3,240.55
16/06/2024 19:05`,
    expect: {
      kind: 'purchase',
      amount: 212.3,
      merchant: 'Panda',
      last4: '4560',
      at: '2024-06-16 19:05',
    },
  },
  {
    id: 'duplicate-of-alrajhi-online',
    note: 'The same purchase announced a second time with different wording',
    text: `عملية شراء
مدى
بطاقة:4560*
لدى:AMAZON SA
مبلغ:SAR 214.50
في:24-06-12 19:35`,
    expect: {
      kind: 'purchase',
      amount: 214.5,
      merchant: 'Amazon',
      last4: '4560',
      at: '2024-06-12 19:35',
    },
  },
  {
    id: 'no-amount',
    note: 'A transaction notice with no amount cannot be trusted',
    text: 'تمت عملية شراء على بطاقتك المنتهية بـ4560',
    expect: null,
    reason: 'no_amount',
  },
  {
    id: 'balance-only',
    note: 'A balance enquiry is not a transaction',
    text: 'رصيدك الحالي 3,240.55 ريال في حسابك ****4321',
    expect: null,
    reason: 'no_kind',
  },
  {
    id: 'otp-ar',
    note: 'One time passcode, rejected outright',
    text: 'رمز التحقق الخاص بك هو 482913 لا تشاركه مع أحد',
    expect: null,
    reason: 'not_a_transaction',
  },
  {
    id: 'otp-en',
    note: 'English one time passcode',
    text: 'Your OTP is 4821. Do not share it with anyone.',
    expect: null,
    reason: 'not_a_transaction',
  },
  {
    id: 'marketing-ar',
    note: 'Promotional message with a percentage that must not become an amount',
    text: 'عرض خاص! خصم يصل إلى 50% على جميع المنتجات، تسوق الآن',
    expect: null,
    reason: 'not_a_transaction',
  },
  {
    id: 'statement-notice',
    note: 'Statement availability notice',
    text: 'كشف الحساب جاهز للتحميل عبر التطبيق',
    expect: null,
    reason: 'not_a_transaction',
  },
  {
    id: 'login-notice',
    note: 'Security notice, no money moved',
    text: 'تم تسجيل الدخول إلى حسابك من جهاز جديد',
    expect: null,
    reason: 'not_a_transaction',
  },
  {
    id: 'empty-noise',
    note: 'Whitespace only',
    text: '   ',
    expect: null,
    reason: 'empty',
  },
  // Formats collected from a live Saudi inbox: two banks, both languages, with
  // the clock written before the date in Arabic and the merchant on a `From:`
  // line in English. Dates are shifted to sit before FIXTURE_NOW; the layouts
  // are exactly as received.
  {
    id: 'live-en-local-applepay',
    note: 'Local purchase through Apple Pay, merchant on an At: line',
    text: `Local Purchase
Card: *9104; Apple Pay 
Amount: 4 SAR
At: Meed E
Date: 12/06/24 18:35`,
    expect: {
      kind: 'purchase',
      amount: 4,
      merchant: 'Meed E',
      last4: '9104',
      institution: 'applepay',
      at: '2024-06-12 18:35',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-en-online-from-line',
    note: 'Online purchase with the merchant on a From: line and the amount inline',
    text: `Online Purchase Transaction Amount 19.5 SAR 
From: HUNGER
 Card: *9104 
Date 12/06/24 03:23`,
    expect: {
      kind: 'purchase',
      amount: 19.5,
      merchant: 'Hunger',
      last4: '9104',
      at: '2024-06-12 03:23',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-en-adding-money',
    note: 'Account top up; the At: line is a timestamp and must not become a merchant',
    text: `Adding money to account
Amount: 452 SAR
Via: *tion
At: 2024-06-12 13:48`,
    expect: {
      kind: 'deposit',
      amount: 452,
      merchant: '',
      at: '2024-06-12 13:48',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-en-internal-incoming',
    note: 'Incoming transfer from a person, no spaces after the labels',
    text: `Internal incoming transfer
Amount:500SR
From:F ALMESHARI
Acc:219
At:12/06/24 13:44`,
    expect: {
      kind: 'transfer_in',
      amount: 500,
      merchant: 'F Almeshari',
      at: '2024-06-12 13:44',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-en-declined',
    note: 'Declined attempt; reads like a purchase but no money moved',
    text: `Insufficient balance
Transaction: Online Purchase
Card: ***9104
Amount: 33.83 SAR
At: HUNGERSTATION LLC
Date: 12/06/24 04:00`,
    expect: null,
    reason: 'declined',
  },
  {
    id: 'live-en-crossborder-fees',
    note: 'Foreign merchant billed in SAR with a fee; the total due is what was debited',
    text: `Online Purchase
Via: *9104,Visa
Amount: 16.6 SAR
From: EPC*EP
Exchange rate: 1
VAT: 0.00 SAR
Fees: 0.33 SAR
Total due amount: 16.93 SAR
Remaining balance: 222.09 SAR
Country: CH
At: 12/06/24 22:47`,
    expect: {
      kind: 'purchase',
      amount: 16.93,
      merchant: 'EPC*EP',
      last4: '9104',
      institution: 'visa',
      at: '2024-06-12 22:47',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-ar-pos-time-before-date',
    note: 'mada point of sale with the clock written before the date',
    text: `شراء عبر نقاط بيع SAR 50
بطاقة 6672* مدى- ApplePay
من ALDREES 15*
في 07:51 24-06-12`,
    expect: {
      kind: 'purchase',
      amount: 50,
      merchant: 'Aldrees 15',
      last4: '6672',
      institution: 'applepay',
      at: '2024-06-12 07:51',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-ar-incoming-from-person',
    note: 'Incoming local transfer from a person named in Arabic',
    text: `حوالة واردة محلية
مبلغ 50 SAR
من هند عبدالعزيز محمد المحارب
حساب *0000
في 06:26 24-06-12`,
    expect: {
      kind: 'transfer_in',
      amount: 50,
      merchant: 'هند عبدالعزيز محمد المحارب',
      last4: '0000',
      at: '2024-06-12 06:26',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-ar-online-latin-merchant',
    note: 'Arabic online purchase alert carrying a Latin merchant name',
    text: `شراء إنترنت
مبلغ 19.35 SAR
بطاقة 6672* مدى-ApplePay
حساب *0000
من HUNGERSTATION LLC
في 23:54 24-06-12`,
    expect: {
      kind: 'purchase',
      amount: 19.35,
      merchant: 'Hungerstation',
      last4: '6672',
      institution: 'applepay',
      at: '2024-06-12 23:54',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-ar-self-transfer-bank',
    note: 'Wallet top up of the user own account, sent as a purchase alert',
    text: `شراء إنترنت
مبلغ 1,576 SAR
بطاقة 6672* مدى-ApplePay
حساب *0000
من STC Bank
في 12:27 24-06-12`,
    expect: {
      kind: 'self_transfer',
      amount: 1576,
      merchant: 'STC Bank',
      last4: '6672',
      at: '2024-06-12 12:27',
      timeKnown: true,
      needsReview: false,
    },
  },
  {
    id: 'live-en-self-transfer-wallet',
    note: 'Same movement in English, counterparty is a wallet provider',
    text: `Local Purchase
Card: *9104; Apple Pay 
Amount: 300 SAR
At: urpay
Date: 12/06/24 11:02`,
    expect: {
      kind: 'self_transfer',
      amount: 300,
      merchant: 'urpay',
      last4: '9104',
      at: '2024-06-12 11:02',
      timeKnown: true,
      needsReview: false,
    },
  },
];
