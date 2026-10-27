import { useMemo, useState } from 'react';
import { Copy, Download, Maximize2, Minus, Plus, Search, Trash2, Upload } from 'lucide-react';
import { getCard, type CardDef } from '@pal/cards';
import { copyLimit, isImplemented } from '@pal/engine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CardInspector } from '@/components/CardInspector';
import { CardFace } from '@/components/game/CardFace';
import { applyFilters, DEFAULT_FILTERS, FILTER_OPTIONS } from '@/lib/cardFilters';
import {
  checkDeck,
  DECK_RULES,
  deckFromText,
  deckSize,
  deckToText,
  luckyCount,
  newDeckId,
  useDecks,
  type DeckList,
} from '@/lib/decks';
import { cn } from '@/lib/utils';

const KIND_ORDER = ['Pal', 'Structure', 'Gear', 'Event'] as const;

/** Build and manage decks. Saved in this browser; usable in local and online games. */
export function DecksPage() {
  const decks = useDecks();
  const [selectedId, setSelectedId] = useState<string | null>(() => decks.saved[0]?.id ?? decks.all[0]!.id);
  const selected = decks.all.find((d) => d.id === selectedId) ?? null;

  const create = () => {
    const deck = decks.save({ id: newDeckId(), name: 'New deck', cards: {}, updatedAt: Date.now() });
    setSelectedId(deck.id);
  };
  const copy = (d: DeckList) => {
    const deck = decks.save({
      ...d,
      id: newDeckId(),
      name: `${d.name.replace(/ \(approximate\)$/, '')} (copy)`,
      builtIn: undefined,
    });
    setSelectedId(deck.id);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="flex flex-col gap-3 lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Decks</h1>
          <Button size="sm" onClick={create}>
            <Plus data-icon="inline-start" /> New deck
          </Button>
        </div>
        <DeckGroup
          title="Your decks"
          decks={decks.saved}
          selectedId={selectedId}
          onSelect={setSelectedId}
          empty="No decks yet."
        />
        <DeckGroup
          title="Starter decks"
          decks={decks.all.filter((d) => d.builtIn)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </aside>

      {selected ? (
        <DeckEditor
          key={selected.id}
          deck={selected}
          onSave={(d) => decks.save(d)}
          onCopy={() => copy(selected)}
          onDelete={() => {
            decks.remove(selected.id);
            setSelectedId(decks.all.find((d) => d.id !== selected.id)?.id ?? null);
          }}
        />
      ) : (
        <p className="py-10 text-center text-muted-foreground">Pick a deck or make a new one.</p>
      )}
    </div>
  );
}

function DeckGroup(props: {
  title: string;
  decks: DeckList[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{props.title}</h2>
      {props.decks.length === 0 && props.empty && <p className="text-sm text-muted-foreground">{props.empty}</p>}
      {props.decks.map((d) => {
        const check = checkDeck(d);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => props.onSelect(d.id)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition',
              d.id === props.selectedId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            <span className="truncate font-medium">{d.name}</span>
            <span
              className={cn(
                'shrink-0 text-xs tabular-nums',
                d.id !== props.selectedId && !check.legal && 'text-destructive',
              )}
            >
              {deckSize(d)}/{DECK_RULES.size}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function DeckEditor({
  deck,
  onSave,
  onCopy,
  onDelete,
}: {
  deck: DeckList;
  onSave: (d: DeckList) => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  // Edits apply straight away for your decks (saved as you go); starter decks are read-only.
  const readOnly = !!deck.builtIn;
  const update = (cards: Record<string, number>) => !readOnly && onSave({ ...deck, cards });
  const [tab, setTab] = useState<'cards' | 'deck'>('cards');
  const [inspect, setInspect] = useState<CardDef | null>(null);

  const add = (id: string) => {
    const n = deck.cards[id] ?? 0;
    if (n >= copyLimit(id)) return;
    update({ ...deck.cards, [id]: n + 1 });
  };
  const removeOne = (id: string) => {
    const next = { ...deck.cards };
    if ((next[id] ?? 0) <= 1) delete next[id];
    else next[id]! -= 1;
    update(next);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={tab}
          onValueChange={(v) => v && setTab(v as typeof tab)}
        >
          <ToggleGroupItem value="cards">Cards</ToggleGroupItem>
          <ToggleGroupItem value="deck">
            Deck · {deckSize(deck)}/{DECK_RULES.size}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        <div className={cn('min-w-0 flex-1', tab !== 'cards' && 'hidden lg:block')}>
          <CardPool deck={deck} readOnly={readOnly} onAdd={add} onRemove={removeOne} onInspect={setInspect} />
        </div>
        <div className={cn('lg:w-80 lg:shrink-0', tab !== 'deck' && 'hidden lg:block')}>
          <DeckPanel
            deck={deck}
            readOnly={readOnly}
            onRename={(name) => !readOnly && onSave({ ...deck, name })}
            onAdd={add}
            onRemove={removeOne}
            onReplace={update}
            onCopy={onCopy}
            onDelete={onDelete}
            onInspect={setInspect}
          />
        </div>
      </div>
      <CardInspector
        instance={
          inspect
            ? {
                id: inspect.id,
                cardId: inspect.id,
                owner: 0,
                rested: false,
                damage: 0,
                modifiers: [],
                placedAt: 0,
                assignedTo: null,
              }
            : null
        }
        onClose={() => setInspect(null)}
      />
    </div>
  );
}

function CardPool(props: {
  deck: DeckList;
  readOnly: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onInspect: (c: CardDef) => void;
}) {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [lucky, setLucky] = useState(false);
  const [playableOnly, setPlayableOnly] = useState(false);

  const cards = useMemo(
    () =>
      applyFilters({
        ...DEFAULT_FILTERS,
        query,
        kinds,
        colors,
        subKind: lucky ? 'Lucky Pal' : '',
        sort: 'cost',
      }).filter((c) => !playableOnly || isImplemented(c.id)),
    [query, kinds, colors, lucky, playableOnly],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards"
          className="pl-8"
          aria-label="Search cards"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={kinds}
          onValueChange={setKinds}
          aria-label="Type"
        >
          {FILTER_OPTIONS.kinds.map((k) => (
            <ToggleGroupItem key={k} value={k}>
              {k}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={colors}
          onValueChange={setColors}
          aria-label="Colour"
        >
          {FILTER_OPTIONS.colors.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          size="sm"
          variant={lucky ? 'default' : 'outline'}
          onClick={() => setLucky((v) => !v)}
          aria-pressed={lucky}
        >
          Lucky
        </Button>
        <Button
          size="sm"
          variant={playableOnly ? 'default' : 'outline'}
          onClick={() => setPlayableOnly((v) => !v)}
          aria-pressed={playableOnly}
          title="Only cards whose text the game fully enforces"
        >
          Fully playable only
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {cards.length} cards
        {props.readOnly ? ' · starter decks are read-only: make a copy to edit' : ' · click a card to add it'}
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
        {cards.map((c) => {
          const n = props.deck.cards[c.id] ?? 0;
          return (
            <li key={c.id} className="group relative">
              <button
                type="button"
                disabled={props.readOnly || n >= copyLimit(c.id)}
                onClick={() => props.onAdd(c.id)}
                title={props.readOnly ? c.name : `Add ${c.name}`}
                className={cn(
                  'block w-full overflow-hidden rounded-md ring-primary transition enabled:hover:ring-2 disabled:cursor-default',
                  n > 0 && 'ring-2',
                )}
              >
                <CardFace card={c} className="aspect-[400/559] bg-muted" />
              </button>
              {(n > 0 || !isImplemented(c.id)) && (
                <div className="pointer-events-none absolute top-1 right-1 flex flex-col items-end gap-0.5">
                  {n > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
                      ×{n}
                    </span>
                  )}
                  {!isImplemented(c.id) && (
                    <span
                      className="rounded bg-amber-500/90 px-1 text-[9px] font-bold text-amber-950"
                      title="This card's text isn't automated yet"
                    >
                      Stats only
                    </span>
                  )}
                </div>
              )}

              <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label={`Read ${c.name}`} onClick={() => props.onInspect(c)}>
                  <Maximize2 />
                </IconButton>
                {n > 0 && !props.readOnly && (
                  <IconButton label={`Remove one ${c.name}`} onClick={() => props.onRemove(c.id)}>
                    <Minus />
                  </IconButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-full bg-background/90 p-1 shadow ring-1 ring-border hover:bg-muted [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function DeckPanel(props: {
  deck: DeckList;
  readOnly: boolean;
  onRename: (name: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onReplace: (cards: Record<string, number>) => void;
  onCopy: () => void;
  onDelete: () => void;
  onInspect: (c: CardDef) => void;
}) {
  const { deck } = props;
  const check = checkDeck(deck);
  const size = deckSize(deck);
  const lucky = luckyCount(deck);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    cards: Object.entries(deck.cards)
      .map(([id, n]) => ({ def: getCard(id)!, n }))
      .filter((x) => x.def?.kind === kind)
      .sort((a, b) => (a.def.cost ?? 0) - (b.def.cost ?? 0) || a.def.name.localeCompare(b.def.name)),
  })).filter((g) => g.cards.length > 0);

  const exportText = async () => {
    try {
      await navigator.clipboard.writeText(deckToText(deck));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked.
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-3 lg:sticky lg:top-20">
      <Input
        value={deck.name}
        readOnly={props.readOnly}
        maxLength={40}
        onChange={(e) => props.onRename(e.target.value)}
        aria-label="Deck name"
        className="font-display text-lg font-bold"
      />
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge variant={size === DECK_RULES.size ? 'default' : 'secondary'}>
          {size}/{DECK_RULES.size} cards
        </Badge>
        <Badge variant={lucky > DECK_RULES.lucky ? 'destructive' : 'secondary'}>
          Lucky {lucky}/{DECK_RULES.lucky}
        </Badge>
        {check.legal && <Badge className="bg-emerald-600 text-white">Ready to play</Badge>}
      </div>
      {check.problems.length > 0 && (
        <ul className="list-disc rounded-md bg-destructive/10 py-2 pr-2 pl-6 text-xs text-destructive">
          {check.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {check.unscripted.length > 0 && (
        <p className="rounded-md bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          {check.unscripted.length} card{check.unscripted.length > 1 ? 's' : ''} marked "Stats only": their text isn't
          automated yet, so in a game they only use their cost, power and strike.
        </p>
      )}

      <div className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-24rem)]">
        {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No cards yet.</p>}
        {groups.map((g) => (
          <section key={g.kind}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {g.kind} · {g.cards.reduce((a, c) => a + c.n, 0)}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {g.cards.map(({ def, n }) => (
                <li key={def.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/60">
                  <span className="w-5 text-center font-bold tabular-nums">{def.cost ?? 0}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={() => props.onInspect(def)}
                  >
                    {def.name}
                    {!isImplemented(def.id) && (
                      <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">stats only</span>
                    )}
                  </button>
                  {!props.readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove one ${def.name}`}
                      onClick={() => props.onRemove(def.id)}
                      className="rounded p-0.5 hover:bg-muted"
                    >
                      <Minus className="size-3.5" />
                    </button>
                  )}
                  <span className="w-5 text-center tabular-nums">{n}</span>
                  {!props.readOnly && (
                    <button
                      type="button"
                      aria-label={`Add one ${def.name}`}
                      disabled={n >= copyLimit(def.id)}
                      onClick={() => props.onAdd(def.id)}
                      className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => void exportText()}>
          <Download data-icon="inline-start" /> {copied ? 'Copied' : 'Export'}
        </Button>
        {!props.readOnly && (
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
            <Upload data-icon="inline-start" /> Import
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={props.onCopy}>
          <Copy data-icon="inline-start" /> {props.readOnly ? 'Make a copy' : 'Copy'}
        </Button>
        {!props.readOnly && (
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
        )}
      </div>

      <ImportDialog open={importing} onOpenChange={setImporting} onImport={props.onReplace} />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Delete "{deck.name}"?</DialogTitle>
          <DialogDescription>This can't be undone.</DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={props.onDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport: (cards: Record<string, number>) => void;
}) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => deckFromText(text), [text]);
  const total = Object.values(parsed.cards).reduce((a, b) => a + b, 0);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Import a deck list</DialogTitle>
        <DialogDescription>
          One card per line, e.g. <code>4 ETD01-002</code> or <code>4 Jolthog – Shocking Yet Innocent</code>. This
          replaces the deck's cards.
        </DialogDescription>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs"
          aria-label="Deck list"
        />
        <p className="text-xs text-muted-foreground">
          {total} cards recognised
          {parsed.unknown.length > 0 && (
            <span className="text-destructive"> · couldn't read: {parsed.unknown.slice(0, 3).join(', ')}</span>
          )}
        </p>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={total === 0}
            onClick={() => {
              props.onImport(parsed.cards);
              props.onOpenChange(false);
              setText('');
            }}
          >
            Import {total} cards
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
