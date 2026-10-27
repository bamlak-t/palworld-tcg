import { useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  BattleFigure,
  BoardFigure,
  CardTypesFigure,
  DamageFigure,
  KeywordFigure,
  SoulsFigure,
  TurnFigure,
  WinFigure,
} from '@/components/HelpFigures';
import { cn } from '@/lib/utils';

/** How to play, in short sections. The full rules summary lives in docs/RULES.md. */
const SECTIONS: { id: string; title: string; figure?: ReactNode; body: ReactNode }[] = [
  {
    id: 'win',
    figure: <WinFigure />,
    title: 'How to win',
    body: (
      <>
        <p>Two players, one deck each. You win when your opponent:</p>
        <ul>
          <li>
            drops to <b>0 life</b> (everyone starts at 10), or
          </li>
          <li>
            has <b>no cards left in their deck</b>.
          </li>
        </ul>
        <p>
          Damage to a player burns cards off their deck first (see <i>Damage &amp; Lucky Pals</i>), so running out of
          cards is a real way to lose.
        </p>
      </>
    ),
  },
  {
    id: 'turn',
    figure: <TurnFigure />,
    title: 'Your turn',
    body: (
      <>
        <p>Every turn runs through five phases, shown top-left of your side of the board:</p>
        <ol>
          <li>
            <b>Stand</b>: everything you have stands up again (cards and souls).
          </li>
          <li>
            <b>Draw</b>: draw 1 card. The first player skips this on turn 1.
          </li>
          <li>
            <b>Soul</b>: move 2 souls from your soul deck to your soul area.
          </li>
          <li>
            <b>Main</b>: play cards, use abilities and attack, in any order, as often as you can.
          </li>
          <li>
            <b>End</b>: damage on Pals and structures is cleared, and "until end of turn" effects stop.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: 'souls',
    figure: <SoulsFigure />,
    title: 'Souls & resources',
    body: (
      <>
        <p>
          <b>Souls are your mana.</b> A card costing 3 means resting 3 standing souls. Spent souls stand again next
          turn.
        </p>
        <p>
          Your <b>soul deck</b> holds your 10 souls. Each soul phase moves 2 into your soul area, so you get more each
          turn until all 10 are out. The player going second starts with 1 soul.
        </p>
        <p>Once per turn you can rest 3 souls to draw a card.</p>
        <p>
          <b>Material</b> and <b>Ingredient</b> are counters you build up from card effects (often by assigning Pals to
          structures) and spend on powerful abilities. They don't reset between turns.
        </p>
      </>
    ),
  },
  {
    id: 'cards',
    figure: <CardTypesFigure />,
    title: 'Card types',
    body: (
      <>
        <ul>
          <li>
            <b>Pals</b> fight. <b>Power</b> is the damage they deal to Pals and how much they can take; <b>Strike</b> is
            the damage they deal to a player. Max 5 Pals in your base.
          </li>
          <li>
            <b>Structures</b> sit in your base. Many have abilities that cost "Assign 1 Pal": rest one of your Pals to
            put it to work.
          </li>
          <li>
            <b>Gears</b> sit in your base and usually rest to give a boost.
          </li>
          <li>
            <b>Events</b> do something once, then go to the graveyard.
          </li>
        </ul>
        <p>Rested (sideways) Pals have attacked or are working, so they can't attack or block until your next turn.</p>
      </>
    ),
  },
  {
    id: 'battle',
    figure: <BattleFigure />,
    title: 'Battle',
    body: (
      <>
        <p>During your main phase, a standing Pal can attack. A battle has its own steps:</p>
        <ol>
          <li>
            <b>Attack</b>: rest your Pal and pick a target: the opponent, or one of their <i>rested</i> Pals or
            structures.
          </li>
          <li>
            <b>Block</b>: the defender may rest a standing Pal to take the hit instead.
          </li>
          <li>
            <b>Quick</b>: the defender may play Quick cards, like Interrupt to cancel the attack.
          </li>
          <li>
            <b>Damage</b>: Pals hit each other for their power at the same time. Structures don't hit back. A player
            takes damage equal to Strike.
          </li>
          <li>
            <b>End of battle</b>: back to your main phase.
          </li>
        </ol>
        <p>A Pal or structure whose damage reaches its power is destroyed. Damage clears at the end of every turn.</p>
      </>
    ),
  },
  {
    id: 'damage',
    figure: <DamageFigure />,
    title: 'Damage & Lucky Pals',
    body: (
      <>
        <p>When a player takes damage, they flip cards from the top of their deck into the graveyard, one per point:</p>
        <ul>
          <li>
            If a <b>Lucky Pal</b> turns up, the whole hit is cancelled: no life lost.
          </li>
          <li>Otherwise they lose life equal to the damage.</li>
        </ul>
        <p>That's why decks can have up to 8 Lucky Pals: they're your insurance.</p>
      </>
    ),
  },
  {
    id: 'keywords',
    figure: <KeywordFigure />,
    title: 'Keywords',
    body: (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {[
          ['Quick', 'Can be used in the opponent’s quick step.'],
          ['On Deploy', 'Happens when the card enters your base.'],
          ['On Attack', 'Happens when this Pal attacks.'],
          ['Assault', 'Can attack standing Pals.'],
          ['Taunt', 'Must be attacked if it can be.'],
          ['Stealth', 'Can’t be blocked.'],
          ['Vigilance', 'Stands again at the end of your turn.'],
          ['Interrupt', 'Discard from hand to cancel an attack.'],
          ['Brave X', 'Gets +X power when it attacks.'],
          ['Nocturnal', '+300 power at night.'],
          ['Retaliate', 'If it dies in battle, the Pal it fought dies too.'],
          ['Breakthrough', 'Destroying the blocker still deals its Strike to the player.'],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    id: 'app',
    figure: <BoardFigure />,
    title: 'Using the board',
    body: (
      <ul>
        <li>Glowing cards can do something: click one to see its options.</li>
        <li>
          Choose <b>View card</b> (or click any card that isn’t glowing) to read it in full, with sharp text.
        </li>
        <li>To attack the player, click their avatar when it glows.</li>
        <li>Click the graveyard or exile to see what’s in it.</li>
        <li>The log on the side lists everything that happened.</li>
      </ul>
    ),
  },
];

export function HelpDialog() {
  const [active, setActive] = useState(SECTIONS[0]!.id);
  const section = SECTIONS.find((s) => s.id === active)!;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="How to play">
          <CircleHelp />
        </Button>
      </DialogTrigger>
      {/* A fixed height, so switching sections doesn't resize the dialog; the section scrolls. */}
      <DialogContent className="flex h-[min(46rem,calc(100dvh-1.5rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-4 sm:max-w-3xl sm:p-6">
        <DialogTitle className="font-display text-xl">How to play</DialogTitle>
        <DialogDescription className="sr-only">A short guide to the Palworld card game.</DialogDescription>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 sm:flex-row">
          <nav
            className="flex w-full min-w-0 gap-1 overflow-x-auto pb-1 sm:w-44 sm:shrink-0 sm:flex-col sm:pb-0"
            aria-label="Sections"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                aria-current={s.id === active ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap',
                  s.id === active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {s.title}
              </button>
            ))}
          </nav>
          <article
            key={section.id}
            className="prose-sm min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pr-1 text-sm leading-relaxed [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1"
          >
            <h3 className="font-display text-lg font-bold">{section.title}</h3>
            {section.figure}
            {section.body}
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
