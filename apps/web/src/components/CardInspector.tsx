import { useState } from 'react';
import { getCard } from '@pal/cards';
import type { CardInstance } from '@pal/engine';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SharpCard } from '@/components/SharpCard';

/**
 * Full-size view of a card during a game. The card itself carries its name, type and
 * (sharp) text, so the only extra line is what has changed it this turn, if anything.
 */
export function CardInspector({ instance, onClose }: { instance: CardInstance | null; onClose: () => void }) {
  const [sharp, setSharp] = useState(true);
  const def = instance ? getCard(instance.cardId) : undefined;
  const landscape = def?.kind === 'Structure';

  const changes: string[] = [];
  if (instance && def) {
    if (instance.damage > 0) changes.push(`−${instance.damage} damage`);
    for (const m of instance.modifiers) {
      changes.push(
        m.stat === 'keyword'
          ? `${m.keyword} from ${m.source}`
          : `${m.amount > 0 ? '+' : ''}${m.amount} ${m.stat} from ${m.source}`,
      );
    }
  }

  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      {def && (
        // No panel behind the card: it floats on the dimmed page, with solid buttons below it.
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[calc(100vw-1.5rem)] gap-3 bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{def.name}</DialogTitle>
          <DialogDescription className="sr-only">{def.text}</DialogDescription>
          {/* Portrait and landscape cards get about the same area on screen. */}
          <SharpCard
            card={def}
            sharp={sharp}
            className={landscape ? 'w-[min(560px,calc(100vw-3rem))]' : 'w-[min(340px,calc(100vw-3rem))]'}
          />
          {changes.length > 0 && (
            <p className="mx-auto max-w-[min(560px,calc(100vw-3rem))] rounded-md bg-background/90 px-2 py-1 text-center text-xs text-muted-foreground">
              {changes.join(' · ')}
            </p>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="secondary" className="shadow-md" onClick={() => setSharp((s) => !s)}>
              {sharp ? 'Show original text' : 'Show sharp text'}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" size="icon" className="shadow-md" aria-label="Close">
                <X />
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
