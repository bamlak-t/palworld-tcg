import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Final Fantasy-style menu window: blue gradient panel with a gold, corner-cut trim. */
export function Window({
  title,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn('corner-cut bg-window-trim p-[2px] shadow-lg [--cut:12px]', className)}>
      <div
        className={cn(
          'corner-cut h-full bg-gradient-to-b from-window-from to-window-to text-window-foreground [--cut:11px]',
          'shadow-[inset_0_0_0_1px_oklch(1_0_0/0.18)]',
        )}
      >
        {title && (
          <div className="border-b border-window-trim/40 px-4 py-2 font-display text-sm font-semibold tracking-wider text-window-trim uppercase">
            {title}
          </div>
        )}
        <div className={cn('p-4', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
