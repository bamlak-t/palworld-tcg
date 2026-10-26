import { Fragment, useMemo } from 'react';
import { cardDb, textIconUrl, tokenizeText } from '@pal/cards';
import { cn } from '@/lib/utils';

/**
 * Renders official card text with its inline icons. The icons are black ink on
 * transparent PNGs, so the text always sits on a parchment panel like the printed card.
 */
export function CardText({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => tokenizeText(text, cardDb.textIcons), [text]);
  return (
    <p className={cn('rounded-lg bg-parchment p-3 text-sm leading-relaxed text-parchment-foreground', className)}>
      {tokens.map((t, i) => (
        <Fragment key={i}>
          {t.kind === 'text' && t.value}
          {t.kind === 'newline' && <br />}
          {t.kind === 'icon' && (
            <img
              src={textIconUrl(t.file)}
              alt={t.token.replace('@', '')}
              title={t.token.replace('@', '')}
              className="mx-0.5 inline h-[1.2em] w-auto align-[-0.2em]"
            />
          )}
        </Fragment>
      ))}
    </p>
  );
}
