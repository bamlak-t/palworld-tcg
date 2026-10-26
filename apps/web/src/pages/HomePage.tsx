import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Copy, Eye, LogOut, Shield, Swords, Users } from 'lucide-react';
import { getCard, type CardDef } from '@pal/cards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GameCard } from '@/components/game/GameCard';
import { HandFan } from '@/components/game/HandFan';
import { PhaseTracker } from '@/components/game/PhaseTracker';
import { LifeGauge, PileCount, ResourceCounter, SoulTracker } from '@/components/game/PlayerHud';
import { Window } from '@/components/game/Window';
import { BOARD_SKINS, getSkin, type BoardSkin } from '@/lib/skins';
import { cn } from '@/lib/utils';

const card = (id: string): CardDef => {
  const c = getCard(id);
  if (!c) throw new Error(`Unknown card ${id}`);
  return c;
};

// Real trial-deck cards: red/blue (ETD01) vs green/purple (ETD02).
const C = {
  grizzbolt: card('ETD01-001'),
  foxparks: card('ETD01-004'),
  arsox: card('ETD01-005'),
  pengullet: card('ETD01-014'),
  lamball: card('ETD01-023'),
  stonePit: card('ETD01-008'),
  workbench: card('ETD01-009'),
  rifle: card('ETD01-010'),
  ignisBreath: card('ETD01-011'),
  elphidran: card('ETD01-012'),
  mossanda: card('ETD02-001'),
  flopie: card('ETD02-003'),
  cawgnito: card('ETD02-015'),
  incineram: card('ETD02-016'),
  felbat: card('ETD02-018'),
  campfire: card('ETD02-009'),
  hangingTrap: card('ETD02-019'),
  chikipi: card('ETD02-024'),
  broncherry: card('ETD02-006'),
};

export function HomePage() {
  const [skin, setSkin] = useState<BoardSkin>(() => getSkin(null));

  return (
    <div className="flex flex-col gap-12 pb-16">
      <section className="py-8 text-center">
        <h1 className="font-display text-4xl font-bold text-primary sm:text-5xl">Palworld Card Game</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Online play is in progress. Below are concepts for the game UI, built with real cards, so we can settle the
          look before wiring up the rules engine.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild size="lg">
            <Link to="/play/local">Play a local game</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/cards">Browse all cards</Link>
          </Button>
        </div>
      </section>

      <Concept
        title="Game board"
        what="Both players' bases, the phase tracker and HUDs, mid-battle at night. The opponent's hand is face down; your hand fans along the bottom."
        engine={[
          'Each base card needs stand/rest state, damage taken and a list of power modifiers with their source, so the UI can show "1000 → 1300 (Nocturnal)".',
          'Phase and battle step must be explicit in state for the tracker.',
          'Night is a game-wide flag with an expiry ("until end of opponent\'s next turn").',
        ]}
      >
        <BoardMockup skin={skin} />
      </Concept>

      <Concept
        title="Board skins"
        what="Each viewer picks their own background; it's saved in their browser."
        engine={['None: purely cosmetic and client-side.']}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {BOARD_SKINS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSkin(s)}
              className={cn(
                'corner-cut flex aspect-video items-end p-2 text-left text-xs font-semibold text-white [--cut:8px]',
                'ring-offset-2 ring-offset-background transition',
                s.id === skin.id ? 'ring-3 ring-primary' : 'opacity-80 hover:opacity-100',
              )}
              style={{ background: s.background }}
              aria-pressed={s.id === skin.id}
            >
              <span className="drop-shadow">{s.name}</span>
            </button>
          ))}
        </div>
      </Concept>

      <div className="grid gap-12 lg:grid-cols-2">
        <Concept
          title="Block prompt"
          what="When you're attacked, the engine pauses and asks the defender to choose. Valid blockers glow."
          engine={[
            'A pendingChoice in state with the prompt, who must answer, and the legal options.',
            'Options must be listed by the engine so the UI never guesses what is legal.',
          ]}
        >
          <BlockPrompt />
        </Concept>

        <Concept
          title="Damage reveal"
          what="Damage to a player flips cards off their deck one by one. A Lucky Pal cancels the hit."
          engine={[
            'The engine should emit events ("milled X", "Lucky Pal: damage cancelled"), not just the final state, so the UI can animate each step.',
          ]}
        >
          <MillReveal />
        </Concept>

        <Concept
          title="In-play card states"
          what="Standing, rested, attacking, targeted, assigned to a structure, buffed and damaged."
          engine={['Assignment links a Pal to a structure, and that link must be in state.']}
        >
          <CardStates />
        </Concept>

        <Concept
          title="Action log"
          what="Plain-language history of the game, also useful for spectators and debugging."
          engine={['Every engine event needs a readable description, kept in an append-only log.']}
        >
          <ActionLog />
        </Concept>

        <Concept
          title="Lobby"
          what="Create a game and share the code. Seat 2 starts the game; up to 3 more people can watch."
          engine={['Seats and spectators live in the session, outside the rules engine.']}
        >
          <LobbyMockup />
        </Concept>

        <Concept
          title="Rare foil"
          what="Rare printings (SR, OSR, SSP…) get a holo sweep on hover, in the browser and in hand."
          engine={['Players choose which printing of a card to use when building a deck.']}
        >
          <div className="flex flex-wrap items-end justify-center gap-4">
            <GameCard card={C.grizzbolt} size="lg" />
            <GameCard card={C.elphidran} size="lg" />
            <GameCard card={C.broncherry} size="lg" />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Hover a card</p>
        </Concept>
      </div>
    </div>
  );
}

function Concept(props: { title: string; what: string; engine: string[]; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold">{props.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{props.what}</p>
      </div>
      {props.children}
      <details className="rounded-lg border bg-card/60 px-4 py-2 text-sm">
        <summary className="cursor-pointer font-medium">What this needs from the engine</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {props.engine.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function BoardMockup({ skin }: { skin: BoardSkin }) {
  return (
    <div className="overflow-x-auto rounded-xl shadow-xl">
      <div className="flex min-w-[860px] flex-col gap-3 p-4" style={{ background: skin.background }}>
        {/* Opponent */}
        <Window bodyClassName="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
          <span className="font-display font-bold">Opponent</span>
          <LifeGauge life={6} />
          <SoulTracker standing={2} rested={4} inDeck={3} />
          <ResourceCounter kind="Material" value={2} />
          <div className="ml-auto flex gap-4">
            <PileCount label="hand" value={4} />
            <PileCount label="deck" value={31} />
            <PileCount label="grave" value={9} />
          </div>
        </Window>
        <div className="flex justify-center">
          {Array.from({ length: 4 }, (_, i) => (
            <GameCard key={i} faceDown size="xs" className="-mx-1" />
          ))}
        </div>
        <div className="flex min-h-40 items-center justify-center gap-3">
          <GameCard card={C.campfire} size="sm" />
          <GameCard card={C.hangingTrap} size="sm" rested />
          <GameCard card={C.mossanda} size="md" />
          <GameCard card={C.incineram} size="md" rested state="target" damage={1100} powerMod={300} />
          <GameCard card={C.cawgnito} size="md" rested />
          <GameCard card={C.felbat} size="md" />
        </div>

        <Window bodyClassName="py-2">
          <PhaseTracker phase="Main" battleStep="Damage" night turn={7} activeName="You" />
        </Window>

        {/* You */}
        <div className="flex min-h-40 items-center justify-center gap-3">
          <GameCard card={C.grizzbolt} size="md" rested state="attacking" damage={1200} />
          <GameCard card={C.arsox} size="md" />
          <GameCard card={C.pengullet} size="md" rested state="assigned" />
          <GameCard card={C.workbench} size="sm" />
          <GameCard card={C.rifle} size="sm" />
        </div>
        <Window bodyClassName="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
          <span className="font-display font-bold">You</span>
          <LifeGauge life={8} />
          <SoulTracker standing={1} rested={6} inDeck={3} />
          <ResourceCounter kind="Material" value={4} />
          <ResourceCounter kind="Ingredient" value={1} />
          <div className="ml-auto flex gap-4">
            <PileCount label="deck" value={28} />
            <PileCount label="grave" value={11} />
          </div>
        </Window>
        <HandFan
          cards={[C.ignisBreath, C.foxparks, C.lamball, C.stonePit, C.elphidran]}
          playable={[C.ignisBreath.id, C.lamball.id]}
        />
      </div>
    </div>
  );
}

function PromptHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="text-center">
      <h3 className="font-display text-lg font-bold tracking-wide uppercase">{children}</h3>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BlockPrompt() {
  return (
    <div className="flex flex-col gap-5 py-2">
      <PromptHeading sub="Choose a standing Pal to block with, or take the hit (Strike 4).">
        Grizzbolt is attacking you
      </PromptHeading>
      <div className="flex items-center justify-center gap-4">
        <GameCard card={C.grizzbolt} size="sm" rested state="attacking" />
        <Swords className="size-6 text-orange-500" />
        <div className="flex gap-2">
          <GameCard card={C.mossanda} size="sm" state="selectable" />
          <GameCard card={C.felbat} size="sm" state="selectable" />
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <Button>
          <Shield data-icon="inline-start" /> Block
        </Button>
        <Button variant="outline">Don&apos;t block</Button>
      </div>
    </div>
  );
}

function MillReveal() {
  const flipped = [C.ignisBreath, C.workbench, C.broncherry];
  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <PromptHeading sub="Strike 3: flip 3 cards from the top of your deck">Incoming damage: 3</PromptHeading>
      <div className="flex items-end gap-4">
        {flipped.map((c, i) => (
          <div key={c.id} className="flex flex-col items-center gap-2">
            <GameCard card={c} size="sm" state={c.subKind === 'Lucky Pal' ? 'lucky' : undefined} />
            <span className="text-xs text-muted-foreground">Flip {i + 1}</span>
          </div>
        ))}
      </div>
      <p className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
        Attack blocked by Lucky Pal
      </p>
    </div>
  );
}

function CardStates() {
  const items: [string, ReactNode][] = [
    ['Standing', <GameCard card={C.chikipi} size="sm" />],
    ['Rested', <GameCard card={C.chikipi} size="sm" rested />],
    ['Attacking', <GameCard card={C.foxparks} size="sm" rested state="attacking" />],
    ['Target', <GameCard card={C.flopie} size="sm" rested state="target" />],
    ['Assigned', <GameCard card={C.pengullet} size="sm" rested state="assigned" />],
    ['Buffed + damaged', <GameCard card={C.arsox} size="sm" powerMod={300} damage={400} />],
  ];
  return (
    <div className="grid grid-cols-3 gap-4 rounded-xl border bg-card/60 p-4">
      {items.map(([label, node]) => (
        <div key={label} className="flex flex-col items-center justify-end gap-2">
          {node}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

function ActionLog() {
  const lines: [string, string][] = [
    ['T7', 'Opponent played Night via Lamp: Nocturnal Pals get +300.'],
    ['T7', 'You assigned Pengullet to Primitive Workbench: +3 Material.'],
    ['T7', 'Grizzbolt attacked Incineram.'],
    ['T7', 'Opponent did not block.'],
    ['T7', 'Incineram took 1600 damage and was destroyed.'],
    ['T7', 'Grizzbolt took 1200 damage and survived.'],
  ];
  return (
    <Window title="Log" bodyClassName="max-h-64 overflow-y-auto p-0">
      <ol className="divide-y divide-white/10 text-sm">
        {lines.map(([t, line], i) => (
          <li key={i} className="flex gap-3 px-4 py-2">
            <span className="font-display text-xs text-window-trim">{t}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </Window>
  );
}

function LobbyMockup() {
  const seats: [string, string, 'player' | 'spectator' | 'empty'][] = [
    ['Player 1', 'Bamlak', 'player'],
    ['Player 2', 'Waiting…', 'empty'],
    ['Spectator', 'Ashley', 'spectator'],
  ];
  return (
    <Window title="Game lobby" bodyClassName="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-window-foreground/70">Share this code</p>
          <p className="font-display text-3xl font-bold tracking-[0.3em] text-window-trim">K7QP2M</p>
        </div>
        <Button size="sm" className="bg-window-trim text-window-to hover:bg-window-trim/85">
          <Copy data-icon="inline-start" /> Copy link
        </Button>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {seats.map(([seat, name, kind]) => (
          <li key={seat + name} className="flex items-center gap-2 rounded bg-white/5 px-3 py-1.5">
            {kind === 'spectator' ? <Eye className="size-4" /> : <Users className="size-4" />}
            <span className="w-24 text-window-foreground/70">{seat}</span>
            <span className={cn(kind === 'empty' && 'italic text-window-foreground/50')}>{name}</span>
          </li>
        ))}
        <li className="px-3 text-xs text-window-foreground/60">Spectators: 1 / 3</li>
      </ul>
      <div className="flex gap-2">
        <Input placeholder="Enter a code to join" className="bg-white/90 text-slate-900" />
        <Button className="bg-window-trim text-window-to hover:bg-window-trim/85">Join</Button>
        <Button variant="ghost" className="text-window-foreground hover:bg-white/10" aria-label="Leave">
          <LogOut />
        </Button>
      </div>
    </Window>
  );
}
