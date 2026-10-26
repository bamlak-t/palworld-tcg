import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup } from 'motion/react';
import { Swords } from 'lucide-react';
import { getCard } from '@pal/cards';
import {
  getScript,
  type Action,
  type AttackTarget,
  type CardInstance,
  type CostChoice,
  type GameView,
  type Seat,
} from '@pal/engine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GameCard } from '@/components/game/GameCard';
import { Window } from '@/components/game/Window';
import { Avatar } from './Avatar';
import { HudBar } from './HudBar';
import { StatusBar } from './StatusBar';
import { CardInspector } from '@/components/CardInspector';
import { describeCost, describeEvent } from '@/game/describe';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { EventBatch } from '@/game/useLocalGame';
import { skinStyle, type BoardSkin } from '@/lib/skins';
import { cn } from '@/lib/utils';
import { BoardCard, MenuItem, type CardMotion } from './BoardCard';
import { PlayerArea } from './PlayerArea';
import { DamageReveal, PendingDialog } from './Prompts';

type Dispatch = (a: Action) => void;

function findInstance(view: GameView, id: string): CardInstance | undefined {
  for (const p of view.players) {
    for (const zone of [p.base, p.graveyard, p.exile, p.hand ?? []]) {
      const c = zone.find((x) => x.id === id);
      if (c) return c;
    }
  }
  return undefined;
}

/** A card shown in a choice that isn't in a visible zone yet (e.g. just drawn by an effect). */
const looseCard = (id: string, cardId: string, owner: Seat): CardInstance => ({
  id,
  cardId,
  owner,
  rested: false,
  damage: 0,
  modifiers: [],
  placedAt: 0,
  assignedTo: null,
});

interface LegalIndex {
  playable: Set<string>;
  attacks: Map<string, AttackTarget[]>;
  abilities: Map<string, { index: number; costs: CostChoice[] }[]>;
  canEndTurn: boolean;
  canSoulDraw: boolean;
  canPassQuick: boolean;
}

function indexLegal(legal: Action[]): LegalIndex {
  const idx: LegalIndex = {
    playable: new Set(),
    attacks: new Map(),
    abilities: new Map(),
    canEndTurn: false,
    canSoulDraw: false,
    canPassQuick: false,
  };
  for (const a of legal) {
    if (a.type === 'playCard') idx.playable.add(a.cardId);
    else if (a.type === 'attack') idx.attacks.set(a.attackerId, [...(idx.attacks.get(a.attackerId) ?? []), a.target]);
    else if (a.type === 'activate') {
      const list = idx.abilities.get(a.sourceId) ?? [];
      const entry = list.find((x) => x.index === a.index);
      if (entry) entry.costs.push(a.cost ?? {});
      else list.push({ index: a.index, costs: [a.cost ?? {}] });
      idx.abilities.set(a.sourceId, list);
    } else if (a.type === 'endTurn') idx.canEndTurn = true;
    else if (a.type === 'soulDraw') idx.canSoulDraw = true;
    else if (a.type === 'passQuick') idx.canPassQuick = true;
  }
  return idx;
}

/** Hit and attack cues for the latest action. */
function cuesFrom(batch: EventBatch | undefined, seat: Seat): Map<string, CardMotion> {
  const cues = new Map<string, CardMotion>();
  for (const e of batch?.events ?? []) {
    if (e.type === 'battleDamage' || e.type === 'damageDealt') cues.set(e.targetId, { kind: 'shake' });
    if (e.type === 'attackDeclared') {
      const mine = batch!.view.players[seat].base.some((c) => c.id === e.attackerId);
      cues.set(e.attackerId, { kind: 'lunge', direction: mine ? 'up' : 'down' });
    }
  }
  return cues;
}

interface Reveal {
  id: number;
  /** Whose deck the cards come off. */
  ownerName: string;
  amount: number;
  milled: { id: string; cardId: string; lucky: boolean }[];
  cancelled: boolean;
  lifeLost: number;
}

function revealFrom(batch: EventBatch | undefined): Reveal | null {
  if (!batch) return null;
  const damage = batch.events.find((e) => e.type === 'playerDamage');
  if (!damage || damage.type !== 'playerDamage') return null;
  const milled = batch.events.flatMap((e) =>
    e.type === 'milled' && e.seat === damage.seat ? [{ id: e.instanceId, cardId: e.cardId, lucky: e.lucky }] : [],
  );
  const lost = batch.events.find((e) => e.type === 'lifeLost');
  return {
    id: batch.id,
    ownerName: batch.view.players[damage.seat].name,
    amount: damage.amount,
    milled,
    cancelled: batch.events.some((e) => e.type === 'damageCancelled'),
    lifeLost: lost?.type === 'lifeLost' ? lost.amount : 0,
  };
}

export function Board({
  view,
  seat,
  legal,
  dispatch,
  batches,
  skin,
  avatars,
  readOnly,
}: {
  view: GameView;
  seat: Seat;
  legal: Action[];
  dispatch: Dispatch;
  batches: EventBatch[];
  skin: BoardSkin;
  /** Avatar id per seat. */
  avatars: [string, string];
  /** Spectating: no prompts or actions, but cards can still be inspected. */
  readOnly?: boolean;
}) {
  const mobile = useIsMobile();
  const opp: Seat = seat === 0 ? 1 : 0;
  const me = view.players[seat];
  const them = view.players[opp];
  const idx = useMemo(() => indexLegal(readOnly ? [] : legal), [legal, readOnly]);
  const last = batches.at(-1);
  const cues = useMemo(() => cuesFrom(last, seat), [last, seat]);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<string | null>(null);
  const [costPick, setCostPick] = useState<{ card: CardInstance; index: number; costs: CostChoice[] } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [inspect, setInspect] = useState<CardInstance | null>(null);
  const phaseShown = useAutoPhaseSteps(view.phase, last);

  // Clear transient UI whenever the game moves on.
  useEffect(() => {
    setMenuFor(null);
    setTargeting(null);
    setCostPick(null);
    const r = revealFrom(last);
    if (r) setReveal(r);
  }, [last]);
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), 1400 + reveal.milled.length * 450);
    return () => clearTimeout(t);
  }, [reveal]);

  const send = (a: Action) => {
    setMenuFor(null);
    setTargeting(null);
    setCostPick(null);
    dispatch(a);
  };

  const pending = !readOnly && view.pending?.seat === seat ? view.pending : null;
  const blockOptions = pending?.kind === 'block' ? pending.options : [];
  const targetIds = new Set(
    targeting ? (idx.attacks.get(targeting) ?? []).flatMap((t) => (t.kind === 'card' ? [t.id] : [])) : [],
  );
  const canTargetPlayer = targeting ? (idx.attacks.get(targeting) ?? []).some((t) => t.kind === 'player') : false;
  const battle = view.battle;

  const useAbility = (card: CardInstance, index: number, costs: CostChoice[]) => {
    if (costs.length === 1) send({ type: 'activate', sourceId: card.id, index, cost: costs[0] });
    else {
      setMenuFor(null);
      setCostPick({ card, index, costs });
    }
  };

  const cardMenu = (c: CardInstance, inHand: boolean) => {
    const abilities = idx.abilities.get(c.id) ?? [];
    const canPlay = inHand && idx.playable.has(c.id);
    const canAttack = !inHand && idx.attacks.has(c.id);
    const def = getCard(c.cardId)!;
    return (
      <div className="flex flex-col">
        <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{def.name}</p>
        {canPlay && (
          <MenuItem onSelect={() => send({ type: 'playCard', cardId: c.id })} hint={`Rest ${def.cost ?? 0} souls`}>
            Play
          </MenuItem>
        )}
        {canAttack && (
          <MenuItem
            onSelect={() => {
              setMenuFor(null);
              setTargeting(c.id);
            }}
            hint="Then choose a target"
          >
            Attack
          </MenuItem>
        )}
        {abilities.map(({ index, costs }) => (
          <MenuItem
            key={index}
            onSelect={() => useAbility(c, index, costs)}
            hint={costs.length === 1 ? describeCost(c.cardId, index, costs[0]!, view) : `${costs.length} ways to pay`}
          >
            {getScript(c.cardId).acts?.[index]?.label ?? 'Use ability'}
          </MenuItem>
        ))}
        <MenuItem
          onSelect={() => {
            setMenuFor(null);
            setInspect(c);
          }}
        >
          View card
        </MenuItem>
      </div>
    );
  };

  const hasActions = (c: CardInstance, inHand: boolean) =>
    (inHand ? idx.playable.has(c.id) : idx.attacks.has(c.id)) || idx.abilities.has(c.id);

  const renderCard = (c: CardInstance, owner: Seat, opts: { inHand?: boolean; size?: 'xs' | 'sm' | 'md' } = {}) => {
    const mine = owner === seat;
    const isTarget = targetIds.has(c.id);
    const isBlocker = blockOptions.includes(c.id);
    const inBattle =
      battle && (battle.attackerId === c.id || (battle.target.kind === 'card' && battle.target.id === c.id));
    const menu = mine && !targeting && !isBlocker ? cardMenu(c, !!opts.inHand) : undefined;
    const state =
      isTarget || isBlocker
        ? 'selectable'
        : inBattle
          ? battle!.attackerId === c.id
            ? 'attacking'
            : 'target'
          : c.assignedTo
            ? 'assigned'
            : mine && hasActions(c, !!opts.inHand) && !targeting
              ? 'selectable'
              : undefined;
    return (
      <BoardCard
        card={c}
        stats={view.stats[c.id]}
        size={opts.size ?? (mobile ? 'xs' : 'sm')}
        state={state}
        menu={menu}
        menuOpen={menuFor === c.id}
        onMenuOpenChange={(open) => setMenuFor(open ? c.id : null)}
        onClick={
          isTarget
            ? () => send({ type: 'attack', attackerId: targeting!, target: { kind: 'card', id: c.id } })
            : isBlocker
              ? () => send({ type: 'block', blockerId: c.id })
              : () => setInspect(c)
        }
        motionCue={cues.get(c.id)}
        cueKey={last?.id}
      />
    );
  };

  const handSize = mobile ? 'sm' : 'md';
  // Centre the hand when it fits; scroll sideways (instead of clipping) when it doesn't.
  const myHand = (
    <div data-testid="my-hand" className="overflow-x-auto overflow-y-hidden pt-5 pb-4 md:overflow-visible">
      <div className="mx-auto flex w-max px-2">
        {(me.hand ?? []).map((c, i, all) => {
          const offset = i - (all.length - 1) / 2;
          return (
            <div
              key={c.id}
              className="-mx-2 shrink-0 transition-transform duration-200 hover:z-10 hover:-translate-y-4"
              style={{ rotate: `${offset * 3}deg`, translate: `0 ${Math.abs(offset) * 4}px` }}
            >
              {renderCard(c, seat, { inHand: true, size: handSize })}
            </div>
          );
        })}
      </div>
    </div>
  );
  // Face down, same size as yours, with the arc mirrored as if seen from across the table.
  const theirHand = (
    <div className="overflow-x-auto overflow-y-hidden pt-1 pb-4 md:overflow-visible">
      <div className="mx-auto flex w-max px-2">
        {Array.from({ length: them.handCount }, (_, i) => {
          const offset = i - (them.handCount - 1) / 2;
          return (
            <div
              key={i}
              className="-mx-2 shrink-0"
              style={{ rotate: `${-offset * 3}deg`, translate: `0 ${-Math.abs(offset) * 4}px` }}
            >
              <GameCard faceDown size={handSize} />
            </div>
          );
        })}
      </div>
    </div>
  );

  // The opponent's avatar is the target for attacking the player.
  const theirAvatar = canTargetPlayer ? (
    <button
      type="button"
      aria-label={`Attack ${them.name}`}
      title={`Attack ${them.name}`}
      onClick={() => send({ type: 'attack', attackerId: targeting!, target: { kind: 'player', seat: opp } })}
      className="relative rounded-full"
    >
      <Avatar avatarId={avatars[opp]} size={mobile ? 44 : 64} glow />
      <Swords className="absolute -right-1 -bottom-1 size-5 rounded-full bg-orange-500 p-0.5 text-white" />
    </button>
  ) : (
    <Avatar avatarId={avatars[opp]} size={mobile ? 44 : 64} />
  );

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl shadow-xl">
          <div className="relative flex flex-col gap-2 p-2 md:gap-3 md:p-3" style={skinStyle(skin)}>
            <HudBar player={them} />

            <PlayerArea
              player={them}
              flipped
              baseCards={them.base.map((c) => (
                <div key={c.id}>{renderCard(c, opp)}</div>
              ))}
              hand={theirHand}
              avatar={theirAvatar}
              onInspect={setInspect}
            />

            <StatusBar
              view={view}
              action={
                <Button
                  size="sm"
                  className="bg-hud-border text-hud hover:bg-hud-border/85"
                  disabled={!idx.canEndTurn}
                  onClick={() => send({ type: 'endTurn' })}
                >
                  End turn
                </Button>
              }
              prompt={
                targeting || pending?.kind === 'block' || pending?.kind === 'quickStep' ? (
                  <BoardPrompt
                    pending={pending?.kind}
                    targeting={!!targeting}
                    send={send}
                    cancelTargeting={() => setTargeting(null)}
                  />
                ) : undefined
              }
            />

            <PlayerArea
              player={me}
              phase={phaseShown}
              battleStep={battle?.step}
              baseCards={me.base.map((c) => (
                <div key={c.id}>{renderCard(c, seat)}</div>
              ))}
              hand={myHand}
              soulAction={
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={!idx.canSoulDraw}
                  onClick={() => send({ type: 'soulDraw' })}
                  title="Rest 3 souls to draw 1 card (once per turn)"
                >
                  Draw · 3 souls
                </Button>
              }
              avatar={<Avatar avatarId={avatars[seat]} size={mobile ? 44 : 64} />}
              onInspect={setInspect}
            />

            <HudBar player={me} />

            <AnimatePresence>
              {reveal && <DamageReveal key={reveal.id} {...reveal} onDone={() => setReveal(null)} />}
            </AnimatePresence>
          </div>
        </div>

        <GameLog batches={batches} />
      </div>

      {!readOnly && (
        <PendingDialog
          view={view}
          seat={seat}
          dispatch={send}
          onInspect={({ id, cardId }) => setInspect(findInstance(view, id) ?? looseCard(id, cardId, seat))}
        />
      )}
      <CardInspector instance={inspect} onClose={() => setInspect(null)} />

      <Dialog open={!!costPick} onOpenChange={(o) => !o && setCostPick(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>How do you want to pay?</DialogTitle>
          <div className="flex flex-col gap-1">
            {costPick?.costs.map((cost, i) => (
              <MenuItem
                key={i}
                onSelect={() => send({ type: 'activate', sourceId: costPick.card.id, index: costPick.index, cost })}
              >
                {describeCost(costPick.card.cardId, costPick.index, cost, view)}
              </MenuItem>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </LayoutGroup>
  );
}

/**
 * Stand, draw and soul have no decisions, so the engine runs them instantly. When a turn
 * starts, step the phase list through them briefly so the turn's flow is visible.
 */
function useAutoPhaseSteps(phase: GameView['phase'], last: EventBatch | undefined) {
  const [shown, setShown] = useState(phase);
  useEffect(() => {
    if (!last?.events.some((e) => e.type === 'turnStarted')) {
      setShown(phase);
      return;
    }
    const steps: GameView['phase'][] = ['stand', 'draw', 'soul', phase];
    setShown(steps[0]!);
    const timers = steps.slice(1).map((p, i) => setTimeout(() => setShown(p), (i + 1) * 320));
    return () => timers.forEach(clearTimeout);
  }, [last, phase]);
  return shown;
}

/** Shown in the middle of the status bar when you need to act on something. */
function BoardPrompt({
  pending,
  targeting,
  send,
  cancelTargeting,
}: {
  pending: string | undefined;
  targeting: boolean;
  send: Dispatch;
  cancelTargeting: () => void;
}) {
  const text = 'font-display text-base font-bold drop-shadow';
  if (targeting) {
    return (
      <>
        <span className={text}>Choose a target</span>
        <Button size="sm" variant="secondary" onClick={cancelTargeting}>
          Cancel
        </Button>
      </>
    );
  }
  if (pending === 'block') {
    return (
      <>
        <span className={text}>You're being attacked: click a glowing Pal to block</span>
        <Button size="sm" variant="secondary" onClick={() => send({ type: 'block', blockerId: null })}>
          Don't block
        </Button>
      </>
    );
  }
  if (pending === 'quickStep') {
    return (
      <>
        <span className={text}>Respond with a Quick card or Interrupt, or pass to take the hit</span>
        <Button
          size="sm"
          className="bg-hud-border text-hud hover:bg-hud-border/85"
          onClick={() => send({ type: 'passQuick' })}
        >
          Pass
        </Button>
      </>
    );
  }
  return null;
}

function GameLog({ batches }: { batches: EventBatch[] }) {
  const lines = useMemo(
    () =>
      batches
        .flatMap((b) => b.events.map((e, i) => ({ key: `${b.id}-${i}`, text: describeEvent(e, b.view) })))
        .filter((l): l is { key: string; text: string } => !!l.text)
        .reverse(),
    [batches],
  );
  return (
    <div className="relative xl:w-72 xl:shrink-0">
      <Window title="Log" className="h-64 xl:absolute xl:inset-0 xl:h-auto" bodyClassName="p-0">
        <ScrollArea className="h-full">
          <ol className="divide-y divide-window-foreground/10 text-sm">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-1.5">
                {l.text}
              </li>
            ))}
            {lines.length === 0 && <li className="px-4 py-2 text-window-foreground/60">Nothing yet.</li>}
          </ol>
        </ScrollArea>
      </Window>
    </div>
  );
}
