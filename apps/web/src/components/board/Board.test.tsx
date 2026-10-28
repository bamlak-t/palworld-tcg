import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getLegalActions, viewFor, type GameState } from '@pal/engine';
import { act, answer, play, put, toMain } from '../../../../../packages/engine/src/testkit.ts';
import { Board } from './Board';
import { SettingsProvider } from '@/lib/settings';
import { DEFAULT_SKIN_ID, getSkin } from '@/lib/skins';

const renderBoard = (s: GameState) =>
  render(
    <SettingsProvider>
      <Board
        view={viewFor(s, 0)}
        seat={0}
        legal={getLegalActions(s, 0)}
        dispatch={() => {}}
        batches={[]}
        skin={getSkin(DEFAULT_SKIN_ID)}
        avatars={['woolly', 'woolly']}
      />
    </SettingsProvider>,
  );

describe('Board', () => {
  it('shows a buffed Pal that survived a battle with its power and the health it has left', () => {
    let s = toMain();
    const atk = put(s, 0, 'base', 'ETD02-001', false); // 900
    const def = put(s, 1, 'base', 'ETD02-001', true); // 900, rested
    s.players[0].soulsStanding = 5;
    s = answer(play(s, 0, 'ETD02-011').s, 0, [atk]); // Stone Blast: +500 until end of turn
    s = act(s, 0, { type: 'attack', attackerId: atk, target: { kind: 'card', id: def } });
    expect(s.players[1].graveyard).toContain(def);

    const { container } = renderBoard(s);
    const card = container.querySelector<HTMLElement>(`[data-card="${atk}"]`)!;
    expect(card.textContent).toContain('1400');
    expect(screen.getByTitle(/Took 900 damage this turn: 500 of 1400 left/).textContent).toBe('500');
  });
});
