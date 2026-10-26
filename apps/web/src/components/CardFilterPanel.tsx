import type { ReactNode } from 'react';
import { Check, Minus, Search } from 'lucide-react';
import { CARD_FEATURES, cardDb, type CardFeature } from '@pal/cards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FILTER_OPTIONS, type CardFilters, type FeatureMode, type Range } from '@/lib/cardFilters';
import { cn } from '@/lib/utils';

type Update = <K extends keyof CardFilters>(key: K, value: CardFilters[K]) => void;

const FEATURE_GROUPS = ['Ability', 'Timing', 'Resource', 'Keyword'] as const;

export function CardFilterPanel({ filters, update }: { filters: CardFilters; update: Update }) {
  return (
    <div className="flex flex-col gap-5">
      <Section label="Search">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => update('query', e.target.value)}
            placeholder="Name, text or card number…"
            className="pl-8"
          />
        </div>
      </Section>

      <MultiChips
        label="Type"
        options={FILTER_OPTIONS.kinds}
        value={filters.kinds}
        onChange={(v) => update('kinds', v)}
      />

      <Section label="Pal rarity">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={filters.subKind || 'any'}
          onValueChange={(v) => update('subKind', v === 'any' || !v ? '' : (v as CardFilters['subKind']))}
        >
          <ToggleGroupItem value="any">Any</ToggleGroupItem>
          <ToggleGroupItem value="Normal Pal">Normal</ToggleGroupItem>
          <ToggleGroupItem value="Lucky Pal">Lucky</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <MultiChips
        label="Colour"
        options={FILTER_OPTIONS.colors}
        value={filters.colors}
        onChange={(v) => update('colors', v)}
      />

      <MultiChips
        label="Element"
        options={FILTER_OPTIONS.elements}
        value={filters.elements}
        onChange={(v) => update('elements', v)}
      />

      <MultiChips
        label="Work suitability"
        options={FILTER_OPTIONS.work}
        value={filters.work}
        onChange={(v) => update('work', v)}
      />

      <RangeFilter
        label="Cost"
        max={FILTER_OPTIONS.maxCost}
        step={1}
        value={filters.cost}
        onChange={(v) => update('cost', v)}
      />
      <RangeFilter
        label="Power / durability"
        max={FILTER_OPTIONS.maxPower}
        step={100}
        value={filters.power}
        onChange={(v) => update('power', v)}
      />

      <RangeFilter
        label="Strike"
        max={FILTER_OPTIONS.maxStrike}
        step={1}
        value={filters.strike}
        onChange={(v) => update('strike', v)}
      />

      <Separator />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Card text</p>
        <p className="text-xs text-muted-foreground">
          Click once for <span className="font-medium text-foreground">has</span>, twice for{' '}
          <span className="font-medium text-foreground">doesn&apos;t have</span>, again to clear.
        </p>
      </div>
      {FEATURE_GROUPS.map((group) => (
        <Section key={group} label={group}>
          <div className="flex flex-wrap gap-1.5">
            {CARD_FEATURES.filter((f) => f.group === group).map((f) => (
              <FeatureChip
                key={f.id}
                feature={f}
                mode={filters.features[f.id]}
                onChange={(mode) => {
                  const next = { ...filters.features };
                  if (mode) next[f.id] = mode;
                  else delete next[f.id];
                  update('features', next);
                }}
              />
            ))}
          </div>
        </Section>
      ))}

      <Separator />

      <MultiChips
        label="Set"
        options={FILTER_OPTIONS.sets}
        value={filters.sets}
        onChange={(v) => update('sets', v)}
        title={(code) => cardDb.sets[code] ?? code}
      />
      <MultiChips
        label="Printing rarity"
        options={FILTER_OPTIONS.rarities}
        value={filters.rarities}
        onChange={(v) => update('rarities', v)}
      />
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MultiChips(props: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  title?: (option: string) => string;
}) {
  return (
    <Section label={props.label}>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={props.value}
        onValueChange={props.onChange}
        className="flex-wrap"
      >
        {props.options.map((o) => (
          <ToggleGroupItem key={o} value={o} title={props.title?.(o)} className="data-[state=on]:border-primary">
            {o}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Section>
  );
}

function RangeFilter(props: { label: string; max: number; step: number; value: Range; onChange: (v: Range) => void }) {
  const [lo, hi] = props.value;
  const full = lo === 0 && hi === props.max;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">{props.label}</Label>
        <span className={cn('text-xs tabular-nums', full ? 'text-muted-foreground' : 'font-medium')}>
          {full ? 'Any' : `${lo} – ${hi}`}
        </span>
      </div>
      <Slider
        min={0}
        max={props.max}
        step={props.step}
        value={props.value}
        onValueChange={(v) => props.onChange([v[0]!, v[1]!])}
        aria-label={props.label}
      />
    </div>
  );
}

const NEXT_MODE: Record<'none' | FeatureMode, FeatureMode | undefined> = {
  none: 'has',
  has: 'lacks',
  lacks: undefined,
};

function FeatureChip(props: {
  feature: CardFeature;
  mode: FeatureMode | undefined;
  onChange: (mode: FeatureMode | undefined) => void;
}) {
  const { mode } = props;
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={mode ? true : false}
      aria-label={`${props.feature.label}: ${mode === 'has' ? 'has' : mode === 'lacks' ? "doesn't have" : 'any'}`}
      onClick={() => props.onChange(NEXT_MODE[mode ?? 'none'])}
      className={cn(
        mode === 'has' && 'border-primary bg-primary/15 hover:bg-primary/25',
        mode === 'lacks' &&
          'border-destructive/60 bg-destructive/10 text-muted-foreground line-through hover:bg-destructive/20',
      )}
    >
      {mode === 'has' && <Check data-icon="inline-start" />}
      {mode === 'lacks' && <Minus data-icon="inline-start" />}
      {props.feature.label}
    </Button>
  );
}
