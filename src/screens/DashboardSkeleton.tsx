/**
 * First-paint placeholder.
 *
 * Blocks match the dimensions of the real content, so the layout does not jump
 * when the database resolves. Suppressed under reduced motion by the global
 * rule in index.css.
 */
import { Card, Skeleton } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';

export function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('common.loading')}>
      <Card>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-40" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </Card>
      <Card>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-[200px]" />
      </Card>
      <Card>
        <Skeleton className="h-3 w-28" />
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </Card>
    </div>
  );
}
