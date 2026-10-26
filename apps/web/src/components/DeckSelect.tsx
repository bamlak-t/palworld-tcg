import { Link } from 'react-router';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { checkDeck, deckSize, DECK_RULES, useDecks } from '@/lib/decks';

/** Pick a deck: your saved decks plus the starter decks. Illegal decks are listed but disabled. */
export function DeckSelect({ value, onChange, id }: { value: string; onChange: (id: string) => void; id?: string }) {
  const { saved, all } = useDecks();
  const builtIn = all.filter((d) => d.builtIn);
  const item = (d: (typeof all)[number]) => {
    const legal = checkDeck(d).legal;
    return (
      <SelectItem key={d.id} value={d.id} disabled={!legal}>
        {d.name}
        {!legal && ` (${deckSize(d)}/${DECK_RULES.size}, not legal)`}
      </SelectItem>
    );
  };
  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-background/70">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {saved.length > 0 && (
            <SelectGroup>
              <SelectLabel>Your decks</SelectLabel>
              {saved.map(item)}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel>Starter decks</SelectLabel>
            {builtIn.map(item)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Link to="/decks" className="self-end text-xs text-muted-foreground underline-offset-2 hover:underline">
        Build a deck
      </Link>
    </div>
  );
}
