/**
 * Settings.
 *
 * Grouped by what the setting affects rather than by how it is stored:
 * appearance, the budget month, income handling, notifications, the
 * categorisation vocabulary, and the data itself.
 */
import { useRef, useState } from 'react';
import type { CategoryRule, Language, RuleCondition, ThemePreference } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import {
  clearEverything,
  createCategory,
  deleteCategory,
  deleteRule,
  mergeCategories,
  reapplyRules,
  saveCategory,
  saveRule,
  saveSettings,
} from '@/db/repo';
import { backupFilename, exportBackup, restoreBackup } from '@/db/backup';
import { CATEGORY_PALETTE } from '@/categorize/categories';
import { MANUAL_RULE_PRIORITY } from '@/categorize/engine';
import { MAX_BUDGET_START_DAY } from '@/domain/budgetMonth';
import { newId } from '@/lib/id';
import { buildIngestUrl, currentBase } from '@/state/urlIngest';
import { formatDate, formatMoney } from '@/lib/format';
import { categoryColor, categoryName, sortCategories } from '@/lib/category';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Label,
  Select,
  Toggle,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';
import { Sheet, ConfirmSheet } from '@/components/ui/Sheet';
import { CategorySelect } from '@/components/CategorySelect';

const APP_VERSION = '1.0.0';

export function SettingsScreen() {
  const app = useApp();
  const { t, locale } = useI18n();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [restoreText, setRestoreText] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const restoreRef = useRef<HTMLInputElement | null>(null);

  // The address an iOS Shortcut opens. Shown here because a person building
  // the automation needs the exact string for their own deployment.
  const ingestUrl = buildIngestUrl(currentBase(window.location), '');

  const copyIngestUrl = async () => {
    try {
      await navigator.clipboard.writeText(ingestUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the address is on screen to read.
      app.pushToast(ingestUrl);
    }
  };

  const download = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFilename();
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const requestNotifications = async (next: boolean) => {
    if (!next) {
      await saveSettings({ notificationsEnabled: false });
      return;
    }
    if (typeof Notification === 'undefined') {
      app.pushToast(t('settings.notificationsUnsupported'), 'over');
      return;
    }
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') {
      app.pushToast(t('settings.notificationsDenied'), 'over');
      return;
    }
    await saveSettings({ notificationsEnabled: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">{t('settings.title')}</h1>

      <Card>
        <CardHeader title={t('settings.appearance')} />
        <div className="flex max-w-[420px] flex-col gap-4">
          <Field label={t('settings.language')} htmlFor="setting-language">
            <Select
              id="setting-language"
              value={app.settings.language}
              onChange={(event) => void saveSettings({ language: event.target.value as Language })}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t('settings.theme')} htmlFor="setting-theme">
            <Select
              id="setting-theme"
              value={app.settings.theme}
              onChange={(event) => void saveSettings({ theme: event.target.value as ThemePreference })}
            >
              <option value="system">{t('settings.theme.system')}</option>
              <option value="light">{t('settings.theme.light')}</option>
              <option value="dark">{t('settings.theme.dark')}</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.budgetMonth')} />
        <div className="max-w-[420px]">
        <Field
          label={t('settings.budgetStartDay')}
          hint={t('settings.budgetStartHint')}
          htmlFor="setting-start-day"
        >
          <Select
            id="setting-start-day"
            value={String(app.settings.budgetStartDay)}
            onChange={(event) =>
              void saveSettings({ budgetStartDay: Number.parseInt(event.target.value, 10) })
            }
          >
            {Array.from({ length: MAX_BUDGET_START_DAY }, (_unused, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </Select>
        </Field>
        </div>
        <p className="num text-caption text-ink-3 mt-2">
          {t('settings.currentPeriod', {
            from: formatDate(app.month.start, locale),
            to: formatDate(app.month.end - 1, locale),
          })}
        </p>
      </Card>

      <Card>
        <CardHeader title={t('settings.income')} />
        <Toggle
          id="setting-confirm-income"
          checked={app.settings.confirmIncome}
          onChange={(next) => void saveSettings({ confirmIncome: next })}
          label={t('settings.confirmIncome')}
          hint={t('settings.confirmIncomeHint')}
        />
      </Card>

      <Card>
        <CardHeader title={t('settings.notifications')} />
        <Toggle
          id="setting-notifications"
          checked={app.settings.notificationsEnabled}
          onChange={(next) => void requestNotifications(next)}
          label={t('settings.notificationsEnable')}
        />
      </Card>

      <Card>
        <CardHeader title={t('settings.categories')} />
        <div className="flex flex-wrap gap-2">
          <Button icon="shopping-bag" onClick={() => setCategoriesOpen(true)}>
            {t('settings.categoriesManage')}
          </Button>
          <Button icon="list-filter" onClick={() => setRulesOpen(true)}>
            {t('settings.rulesManage')}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.data')} />
        <div className="flex flex-col gap-4">
          <div>
            <Button icon="download" onClick={() => void download()}>
              {t('settings.backup')}
            </Button>
            <p className="text-caption text-ink-3 mt-1.5">{t('settings.backupHint')}</p>
          </div>
          <div>
            <input
              ref={restoreRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void file.text().then(setRestoreText);
              }}
            />
            <Button icon="upload" onClick={() => restoreRef.current?.click()}>
              {t('settings.restore')}
            </Button>
            <p className="text-caption text-ink-3 mt-1.5">{t('settings.restoreHint')}</p>
          </div>
          <div>
            <Button variant="danger" icon="trash" onClick={() => setErasing(true)}>
              {t('settings.erase')}
            </Button>
            <p className="text-caption text-ink-3 mt-1.5">{t('settings.eraseHint')}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.about')} />
        <p className="text-body text-ink-2">{t('settings.aboutBody')}</p>
        <dl className="mt-4 flex flex-col gap-3">
          <div>
            <dt>
              <Label>{t('settings.install')}</Label>
            </dt>
            <dd className="text-body text-ink-2 mt-0.5">{t('settings.installHint')}</dd>
          </div>
          <div>
            <dt>
              <Label>{t('settings.shortcut')}</Label>
            </dt>
            <dd className="text-body text-ink-2 mt-0.5">{t('settings.shortcutHint')}</dd>
          </div>
        </dl>
        <div className="border-line mt-4 border-t pt-4">
          <Label className="mb-1.5 block">{t('settings.shortcutUrl')}</Label>
          <div className="flex items-center gap-2">
            <code className="bg-sunken border-line text-caption text-ink-2 min-w-0 flex-1 truncate rounded-[var(--r-sm)] border px-2.5 py-2">
              {ingestUrl}
            </code>
            <Button compact icon="upload" onClick={() => void copyIngestUrl()}>
              {copied ? t('action.copied') : t('action.copy')}
            </Button>
          </div>
          <p className="text-caption text-ink-3 mt-1.5">{t('settings.shortcutUrlHint')}</p>
        </div>

        <p className="num text-caption text-ink-3 mt-4">
          {t('settings.version', { version: APP_VERSION })}
        </p>
      </Card>

      <CategoriesSheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <ConfirmSheet
        open={erasing}
        onClose={() => setErasing(false)}
        onConfirm={() => {
          void clearEverything().then(() => app.pushToast(t('settings.erased')));
        }}
        title={t('settings.erase')}
        body={t('settings.eraseConfirm')}
        confirmLabel={t('settings.erase')}
      />

      <ConfirmSheet
        open={restoreText !== undefined}
        onClose={() => setRestoreText(undefined)}
        onConfirm={() => {
          const text = restoreText;
          if (!text) return;
          void restoreBackup(text).then((outcome) => {
            if (outcome.ok) {
              app.pushToast(t('settings.restored', { count: outcome.counts.transactions }));
            } else {
              app.pushToast(t(`settings.restoreFailed.${outcome.error}`), 'over');
            }
          });
        }}
        title={t('settings.restore')}
        body={t('settings.restoreConfirm')}
        confirmLabel={t('settings.restore')}
      />
    </div>
  );
}

function CategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const { t, language } = useI18n();
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [color, setColor] = useState(CATEGORY_PALETTE[0] ?? '#6B7280');
  const [parentId, setParentId] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [deleting, setDeleting] = useState<string | undefined>(undefined);

  const editing = editingId ? app.categoryById.get(editingId) : undefined;

  const startNew = () => {
    setEditingId('new');
    setNameAr('');
    setNameEn('');
    setColor(CATEGORY_PALETTE[app.categories.length % CATEGORY_PALETTE.length] ?? '#6B7280');
    setParentId('');
    setMergeTarget('');
  };

  const startEdit = (id: string) => {
    const category = app.categoryById.get(id);
    if (!category) return;
    setEditingId(id);
    setNameAr(category.nameAr);
    setNameEn(category.nameEn);
    setColor(category.color);
    setParentId(category.parentId ?? '');
    setMergeTarget('');
  };

  const submit = async () => {
    const ar = nameAr.trim() || nameEn.trim();
    const en = nameEn.trim() || nameAr.trim();
    if (ar.length === 0) return;
    if (editingId === 'new') {
      await createCategory({
        nameAr: ar,
        nameEn: en,
        color,
        icon: 'circle-dashed',
        ...(parentId ? { parentId } : {}),
      });
    } else if (editing) {
      await saveCategory({
        ...editing,
        nameAr: ar,
        nameEn: en,
        color,
        parentId: parentId || undefined,
      });
    }
    setEditingId(undefined);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t('settings.categories')}
        footer={
          <Button variant="primary" block icon="plus" onClick={startNew}>
            {t('settings.categoryNew')}
          </Button>
        }
      >
        <ul className="flex flex-col">
          {sortCategories(app.categories).map((category, index) => (
            <li key={category.id} className={cx(index > 0 && 'hairline')}>
              <button
                type="button"
                onClick={() => startEdit(category.id)}
                className="hover:bg-sunken flex min-h-11 w-full items-center gap-3 rounded-[var(--r-sm)] px-1.5 text-start"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-[var(--r-full)]"
                  style={{ backgroundColor: categoryColor(category) }}
                />
                <span className="text-body text-ink min-w-0 flex-1 truncate">
                  {categoryName(category, language, '')}
                  {category.parentId ? (
                    <span className="text-ink-3">
                      {' '}
                      · {categoryName(app.categoryById.get(category.parentId), language, '')}
                    </span>
                  ) : null}
                </span>
                {category.builtin ? (
                  <span className="text-caption text-ink-3 shrink-0">
                    {t('settings.categoryBuiltin')}
                  </span>
                ) : null}
                <span className="text-ink-3 shrink-0 rtl:rotate-180">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet
        open={editingId !== undefined}
        onClose={() => setEditingId(undefined)}
        title={editingId === 'new' ? t('settings.categoryNew') : t('action.edit')}
        footer={
          <div className="flex gap-2">
            {editing && !editing.builtin ? (
              <Button variant="danger" icon="trash" onClick={() => setDeleting(editing.id)}>
                {t('action.delete')}
              </Button>
            ) : null}
            <Button variant="primary" className="flex-1" onClick={() => void submit()}>
              {t('action.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('settings.categoryNameAr')} htmlFor="category-name-ar">
            <Input
              id="category-name-ar"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
            />
          </Field>
          <Field label={t('settings.categoryNameEn')} htmlFor="category-name-en">
            <Input
              id="category-name-en"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
            />
          </Field>
          <div>
            <Label className="mb-2 block">{t('settings.categoryColour')}</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  aria-pressed={color === swatch}
                  onClick={() => setColor(swatch)}
                  className={cx(
                    'h-11 w-11 rounded-[var(--r-sm)] p-1.5 transition-colors duration-[120ms]',
                    color === swatch ? 'bg-sunken ring-2 ring-[var(--c-accent)]' : 'hover:bg-sunken',
                  )}
                >
                  <span
                    className="block h-full w-full rounded-[var(--r-sm)]"
                    style={{ backgroundColor: swatch }}
                  />
                </button>
              ))}
            </div>
          </div>
          <Field label={t('settings.categoryParent')} htmlFor="category-parent">
            <CategorySelect
              id="category-parent"
              categories={app.categories.filter(
                (category) => category.id !== editingId && !category.parentId,
              )}
              value={parentId}
              includeAll
              allLabel={t('settings.categoryTopLevel')}
              onChange={setParentId}
            />
          </Field>
          {editing ? (
            <div className="border-line border-t pt-4">
              <Field label={t('settings.categoryMerge')} htmlFor="category-merge">
                <CategorySelect
                  id="category-merge"
                  categories={app.categories.filter((category) => category.id !== editing.id)}
                  value={mergeTarget}
                  includeAll
                  allLabel={t('common.none')}
                  onChange={setMergeTarget}
                />
              </Field>
              <Button
                className="mt-2"
                disabled={mergeTarget === ''}
                onClick={() => {
                  void mergeCategories(editing.id, mergeTarget).then(() => {
                    setEditingId(undefined);
                    setMergeTarget('');
                  });
                }}
              >
                {t('settings.categoryMergeAction')}
              </Button>
            </div>
          ) : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={deleting !== undefined}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => {
          const id = deleting;
          if (!id) return;
          void deleteCategory(id).then(() => setEditingId(undefined));
        }}
        title={t('action.delete')}
        body={t('settings.categoryDeleteConfirm')}
        confirmLabel={t('action.delete')}
      />
    </>
  );
}

const CONDITION_TYPES: RuleCondition['type'][] = [
  'merchant_contains',
  'message_contains',
  'amount_between',
];

function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const { t, locale, language } = useI18n();
  const [editing, setEditing] = useState<CategoryRule | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [conditionType, setConditionType] = useState<RuleCondition['type']>('merchant_contains');
  const [value, setValue] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [categoryId, setCategoryId] = useState('other');

  const startNew = () => {
    setEditing(undefined);
    setCreating(true);
    setConditionType('merchant_contains');
    setValue('');
    setMin('');
    setMax('');
    setCategoryId('other');
  };

  const startEdit = (rule: CategoryRule) => {
    const first = rule.conditions[0];
    setEditing(rule);
    setCreating(true);
    setCategoryId(rule.categoryId);
    if (first?.type === 'amount_between') {
      setConditionType('amount_between');
      setMin(String(first.min));
      setMax(String(first.max));
      setValue('');
    } else if (first) {
      setConditionType(first.type);
      setValue(first.value);
      setMin('');
      setMax('');
    }
  };

  const submit = async () => {
    let condition: RuleCondition;
    if (conditionType === 'amount_between') {
      const low = Number.parseFloat(min.replace(',', '.'));
      const high = Number.parseFloat(max.replace(',', '.'));
      if (!Number.isFinite(low) || !Number.isFinite(high)) return;
      condition = { type: 'amount_between', min: Math.min(low, high), max: Math.max(low, high) };
    } else {
      if (value.trim().length === 0) return;
      condition = { type: conditionType, value: value.trim() };
    }
    await saveRule({
      id: editing?.id ?? newId(),
      origin: 'manual',
      conditions: [condition],
      categoryId,
      enabled: true,
      createdAt: editing?.createdAt ?? Date.now(),
      priority: MANUAL_RULE_PRIORITY,
    });
    const changed = await reapplyRules();
    app.pushToast(t('settings.ruleApplied', { count: changed }));
    setCreating(false);
    setEditing(undefined);
  };

  const describe = (rule: CategoryRule): string =>
    rule.conditions
      .map((condition) =>
        condition.type === 'amount_between'
          ? `${t('settings.ruleCondition.amount_between')} ${formatMoney(condition.min, locale, { decimals: 'never' })} – ${formatMoney(condition.max, locale, { decimals: 'never' })}`
          : `${t(`settings.ruleCondition.${condition.type}`)} "${condition.value}"`,
      )
      .join(' · ');

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t('settings.rules')}
        footer={
          <Button variant="primary" block icon="plus" onClick={startNew}>
            {t('settings.ruleNew')}
          </Button>
        }
      >
        {app.rules.length === 0 ? (
          <p className="text-body text-ink-3 py-4">{t('settings.ruleNone')}</p>
        ) : (
          <ul className="flex flex-col">
            {[...app.rules]
              .sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt)
              .map((rule, index) => (
                <li key={rule.id} className={cx('flex items-center gap-2 py-1', index > 0 && 'hairline')}>
                  <button
                    type="button"
                    onClick={() => startEdit(rule)}
                    className="hover:bg-sunken min-h-11 flex-1 rounded-[var(--r-sm)] px-1.5 py-1.5 text-start"
                  >
                    <span className="text-body text-ink block truncate">{describe(rule)}</span>
                    <span className="text-caption text-ink-3">
                      {t('settings.ruleThen')}{' '}
                      {categoryName(app.categoryById.get(rule.categoryId), language, '')} ·{' '}
                      {rule.origin === 'learned' ? t('settings.ruleLearned') : t('settings.ruleManual')}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('action.delete')}
                    onClick={() => {
                      void deleteRule(rule.id).then(() => void reapplyRules());
                    }}
                    className="text-ink-3 hover:text-over flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Sheet>

      <Sheet
        open={creating}
        onClose={() => {
          setCreating(false);
          setEditing(undefined);
        }}
        title={editing ? t('action.edit') : t('settings.ruleNew')}
        footer={
          <Button variant="primary" block onClick={() => void submit()}>
            {t('action.save')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('settings.ruleIf')} htmlFor="rule-condition">
            <Select
              id="rule-condition"
              value={conditionType}
              onChange={(event) => setConditionType(event.target.value as RuleCondition['type'])}
            >
              {CONDITION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`settings.ruleCondition.${type}`)}
                </option>
              ))}
            </Select>
          </Field>

          {conditionType === 'amount_between' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('transactions.filter.min')} htmlFor="rule-min">
                <Input
                  id="rule-min"
                  inputMode="decimal"
                  value={min}
                  onChange={(event) => setMin(event.target.value)}
                />
              </Field>
              <Field label={t('transactions.filter.max')} htmlFor="rule-max">
                <Input
                  id="rule-max"
                  inputMode="decimal"
                  value={max}
                  onChange={(event) => setMax(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <Field label={t('common.search')} htmlFor="rule-value">
              <Input
                id="rule-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
          )}

          <Field label={t('settings.ruleThen')} htmlFor="rule-category">
            <CategorySelect
              id="rule-category"
              categories={app.categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
