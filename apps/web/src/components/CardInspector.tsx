import { useState } from 'react';
import { getCard } from '@pal/cards';
import type { CardInstance, CardStats } from '@pal/engine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CardText } from '@/components/CardText';
import { SharpCard } from '@/components/SharpCard';

/** Full-size view of a card during a game: sharp text, live stats and what's changed them. */
export function CardInspector({
  instance,
  stats,
  onClose,
}: {
  instance: CardInstance | null;
  stats?: CardStats;
  onClose: () => void;
}) {
  const [sharp, setSharp] = useState(true);
  const def = instance ? getCard(instance.cardId) : undefined;

  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      {def && instance && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="flex w-full flex-col gap-2 sm:w-80 sm:shrink-0">
              <SharpCard card={def} sharp={sharp} />
              <Button variant="ghost" size="sm" onClick={() => setSharp((s) => !s)}>
                {sharp ? 'Show original text' : 'Show sharp text'}
              </Button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="pr-8">
                <DialogDescription>
                  {def.subKind ?? def.kind} · cost {def.cost ?? 0}
                </DialogDescription>
                <DialogTitle className="text-xl">{def.name}</DialogTitle>
              </div>

              {stats && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Stat
                    label={def.kind === 'Structure' ? 'Durability' : 'Power'}
                    value={stats.power}
                    base={def.power}
                  />
                  {def.kind === 'Pal' && <Stat label="Strike" value={stats.strike} base={def.strike} />}
                  {instance.damage > 0 && <Stat label="Damage taken" value={instance.damage} />}
                  <div>
                    <dt className="text-xs text-muted-foreground">State</dt>
                    <dd>{instance.rested ? 'Rested' : 'Standing'}</dd>
                  </div>
                </dl>
              )}

              {stats && stats.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {stats.keywords.map((k) => (
                    <Badge key={k} variant="secondary" className="capitalize">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}

              {instance.modifiers.length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Effects on this card</p>
                  <ul className="text-sm">
                    {instance.modifiers.map((m, i) => (
                      <li key={i}>
                        {m.stat === 'keyword'
                          ? `Gains ${m.keyword}`
                          : `${m.amount > 0 ? '+' : ''}${m.amount} ${m.stat}`}{' '}
                        <span className="text-muted-foreground">
                          from {m.source}
                          {m.duration === 'endOfTurn'
                            ? ', until end of turn'
                            : m.duration === 'endOfBattle'
                              ? ', this battle'
                              : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {def.text && <CardText text={def.text} />}
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Stat({ label, value, base }: { label: string; value: number; base?: number | null }) {
  const changed = base != null && value !== base;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {value}
        {changed && (
          <span
            className={
              value > base! ? 'ml-1 text-emerald-600 dark:text-emerald-400' : 'ml-1 text-rose-600 dark:text-rose-400'
            }
          >
            ({value > base! ? '+' : ''}
            {value - base!})
          </span>
        )}
      </dd>
    </div>
  );
}
