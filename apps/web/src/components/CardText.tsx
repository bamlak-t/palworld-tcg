import { Fragment, useMemo } from 'react';
import { cardDb, textIconUrl, tokenizeText } from '@pal/cards';
import { cn } from '@/lib/utils';

/**
 * Icon heights in em. The word icons (ACT, Quick, Damage…) have their lettering baked in,
 * and each image leaves a different amount of space around it, so one shared height made
 * their words bigger or smaller than the text around them. These heights make the
 * lettering's cap height match the text's (~0.72em), measured from each image. Picture
 * icons are sized to sit on the line.
 */
const ICON_HEIGHT: Record<string, number> = {
  'AUTO@': 1.1, // lettering fills ~65% of the image
  'ACT@': 1.1,
  'CONT@': 1.1,
  'OnDeploy@': 1.15, // ~63%
  'OnAttack@': 1.15,
  'OnAssign@': 1.15,
  'Hand@': 1.2, // ~60%
  '1Turn@': 1.25, // ~58%
  'Damage@': 1.3, // ~55%
  'Quick@': 1.0, // ~72%: the image is cropped tight to its lettering
  'LuckyPal@': 1.3,
};
const PICTURE_HEIGHT = 1.15; // Material, Power, Strike, cost diamonds, elements…

const iconHeight = (token: string) => ICON_HEIGHT[token] ?? PICTURE_HEIGHT;

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
              className="mx-0.5 inline w-auto"
              // Centre the icon on the text's x-height, whatever its height.
              style={{ height: `${iconHeight(t.token)}em`, verticalAlign: `${0.36 - iconHeight(t.token) / 2}em` }}
            />
          )}
        </Fragment>
      ))}
    </p>
  );
}
