import { useMemo, useState, type CSSProperties } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cardDb, imageUrl, type CardDef } from '@pal/cards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CardFilterPanel } from '@/components/CardFilterPanel';
import { CardText } from '@/components/CardText';
import {
  applyFilters,
  countActiveFilters,
  countInView,
  DEFAULT_FILTERS,
  type CardFilters,
  type CardView,
  type SortKey,
} from '@/lib/cardFilters';
import { cn } from '@/lib/utils';

const SORTS: [SortKey, string][] = [
  ['number', 'Card number'],
  ['name', 'Name'],
  ['cost', 'Cost (low → high)'],
  ['power', 'Power (high → low)'],
  ['strike', 'Strike (high → low)'],
];

/**
 * Card tiles fill --cols columns (5 when there's room). Structure tiles are printed
 * landscape (400×286 vs 400×559), so they're widened to keep the same height as a card tile.
 */
const TILE_WIDTH: Record<CardView, string> = {
  cards: 'var(--card-w)',
  structures: 'calc(var(--card-w) * 559 / 286)',
};

const COLOR_CLASS: Record<string, string> = {
  Red: 'bg-pal-red text-white',
  Blue: 'bg-pal-blue text-white',
  Green: 'bg-pal-green text-white',
  Purple: 'bg-pal-purple text-white',
};

export function CardBrowserPage() {
  const [filters, setFilters] = useState<CardFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<CardDef | null>(null);

  const update = <K extends keyof CardFilters>(key: K, value: CardFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const results = useMemo(() => applyFilters(filters), [filters]);
  const active = countActiveFilters(filters);
  const structures = filters.view === 'structures';

  return (
    <div className="flex gap-8">
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 pb-6">
          <CardFilterPanel filters={filters} update={update} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontal data-icon="inline-start" />
                Filters
                {active > 0 && <Badge className="ml-1">{active}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-sm">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <CardFilterPanel filters={filters} update={update} />
              </div>
            </SheetContent>
          </Sheet>

          <p className="text-sm text-muted-foreground">
            {results.length} of {countInView(filters.view)} {structures ? 'structures' : 'cards'}
          </p>
          {active > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ ...DEFAULT_FILTERS, view: filters.view, sort: filters.sort })}
            >
              Clear filters
            </Button>
          )}

          <div className="ml-auto">
            <Select value={filters.sort} onValueChange={(v) => update('sort', v as SortKey)}>
              <SelectTrigger aria-label="Sort by" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {results.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No cards match these filters.</p>
        ) : (
          <div className="@container">
            <ul
              className="flex flex-wrap gap-3 [--cols:2] @md:[--cols:3] @2xl:[--cols:4] @3xl:[--cols:5]"
              style={{ '--card-w': 'calc((100cqw - (var(--cols) - 1) * 0.75rem) / var(--cols))' } as CSSProperties}
            >
              {results.map((c) => (
                <li key={c.id} style={{ width: TILE_WIDTH[filters.view] }}>
                  <button
                    onClick={() => setSelected(c)}
                    className="group block w-full overflow-hidden rounded-lg ring-primary transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
                    title={c.name}
                  >
                    <img
                      src={imageUrl(c)}
                      alt={c.name}
                      loading="lazy"
                      className={cn(
                        'w-full bg-muted object-cover transition group-hover:scale-[1.02]',
                        structures ? 'aspect-[400/286]' : 'aspect-[400/559]',
                      )}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <CardDetail key={selected.id} card={selected} />}
      </Dialog>
    </div>
  );
}

function CardDetail({ card }: { card: CardDef }) {
  const [printing, setPrinting] = useState(card.printings[0]!);

  const stats: [string, string | number | null][] = [
    ['Type', card.subKind ?? card.kind],
    ['Cost', card.cost],
    [card.kind === 'Structure' ? 'Durability' : 'Power', card.power],
    ['Strike', card.strike],
    ['Element', card.elements.join(' / ') || null],
    ['Work', card.workSuitability.join(', ') || null],
    ['Sets', card.sets.map((s) => cardDb.sets[s] ?? s).join(', ')],
  ];

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="sm:w-72 sm:shrink-0">
          <img src={imageUrl(printing)} alt={card.name} className="w-full rounded-lg" />
          {card.printings.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.printings.map((p) => (
                <Button
                  key={p.number}
                  size="xs"
                  variant={p.number === printing.number ? 'default' : 'secondary'}
                  onClick={() => setPrinting(p)}
                >
                  {p.number}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="pr-8">
            <DialogDescription>{card.id}</DialogDescription>
            <DialogTitle className="text-xl">{card.name}</DialogTitle>
            {card.color && <Badge className={cn('mt-2', COLOR_CLASS[card.color])}>{card.color}</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {stats
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {card.text && <CardText text={card.text} />}
        </div>
      </div>
    </DialogContent>
  );
}
