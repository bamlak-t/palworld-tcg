/** The deck builder, rendered as the user sees it. */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecksPage } from './DecksPage';

const stored = () =>
  JSON.parse(localStorage.getItem('pal-decks') ?? '[]') as { name: string; cards: Record<string, number> }[];
/** The card buttons in the pool (titled "Add …", or just the name when read-only). */
const poolCards = () => [...document.querySelectorAll<HTMLButtonElement>('ul.grid li > button')];
const deckList = () => screen.getByText('Your decks').closest('section')!;

function setup(width = 1400) {
  window.innerWidth = width;
  const user = userEvent.setup();
  render(<DecksPage />);
  return user;
}

async function newDeck(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /New deck/ }));
}

/** Clicks enabled cards in the pool (paging on) until n cards have been added. */
async function addCards(user: ReturnType<typeof userEvent.setup>, n: number) {
  let added = 0;
  while (added < n) {
    const enabled = poolCards().filter((b) => !(b as HTMLButtonElement).disabled);
    if (enabled.length === 0) {
      await user.click(screen.getByRole('button', { name: /Next/ }));
      continue;
    }
    await user.click(enabled[0]!);
    added++;
  }
}

describe('deck builder: drafts', () => {
  it('a new deck is not stored until you save it', async () => {
    const user = setup();
    await newDeck(user);
    await addCards(user, 3);
    expect(stored()).toEqual([]);
    expect(within(deckList()).getByText(/unsaved/)).toBeTruthy();
    // The list shows the draft as it stands, not the last saved version.
    expect(within(deckList()).getByText('3/50')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(stored()).toHaveLength(1);
    expect(Object.values(stored()[0]!.cards).reduce((a, b) => a + b, 0)).toBe(3);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('Discard puts the deck back to how it was saved', async () => {
    const user = setup();
    await newDeck(user);
    await addCards(user, 2);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await addCards(user, 3);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(Object.values(stored()[0]!.cards).reduce((a, b) => a + b, 0)).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('2/50 cards')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('renaming is part of the draft too', async () => {
    const user = setup();
    await newDeck(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const name = screen.getByLabelText('Deck name');
    await user.clear(name);
    await user.type(name, 'Night Raiders');
    expect(stored()[0]!.name).toBe('New deck');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(stored()[0]!.name).toBe('Night Raiders');
  });

  it('switching decks with unsaved changes asks first', async () => {
    const user = setup();
    await newDeck(user);
    await addCards(user, 1);
    const starter = within(screen.getByText('Starter decks').closest('section')!).getAllByRole('button')[0]!;

    await user.click(starter);
    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByText('1/50 cards')).toBeTruthy();

    await user.click(starter);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText(/starter decks are read-only/)).toBeTruthy();
    expect(stored()).toEqual([]);
  });

  it('Delete removes a saved deck after confirming', async () => {
    const user = setup();
    await newDeck(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(stored()).toEqual([]);
  });
});

describe('deck builder: limits', () => {
  it('stops at 4 copies of a card', async () => {
    const user = setup();
    await newDeck(user);
    const first = poolCards()[0]!;
    for (let i = 0; i < 6; i++) if (!(first as HTMLButtonElement).disabled) await user.click(first);
    expect((first as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('4/50 cards')).toBeTruthy();
  });

  it('stops at 50 cards while building, not just on save', async () => {
    const user = setup();
    await newDeck(user);
    // Import 48 (12 cards × 4), then fill the last two by clicking.
    await user.click(screen.getByRole('button', { name: /Import/ }));
    await user.click(screen.getByLabelText('Deck list'));
    await user.paste(Array.from({ length: 12 }, (_, i) => `4 EBP01-${String(i + 1).padStart(3, '0')}`).join('\n'));
    await user.click(screen.getByRole('button', { name: /Import 48 cards/ }));
    await addCards(user, 2);
    expect(screen.getByText('50/50 cards')).toBeTruthy();
    expect(screen.getByText(/the deck is full/)).toBeTruthy();
    expect(poolCards().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The + buttons in the deck list are off too.
    expect(screen.getAllByRole('button', { name: /^Add one/ }).every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
  });

  it('an imported list is cut down to 50 cards', async () => {
    const user = setup();
    await newDeck(user);
    await user.click(screen.getByRole('button', { name: /Import/ }));
    const list = [
      'ETD01-002',
      'ETD01-003',
      'ETD01-005',
      'ETD01-006',
      'ETD01-007',
      'ETD01-008',
      'ETD01-009',
      'ETD01-010',
      'ETD01-011',
      'ETD01-012',
      'ETD01-013',
      'ETD01-014',
      'ETD01-015',
      'ETD01-016',
      'ETD01-017',
    ]
      .map((id) => `4 ${id}`)
      .join('\n');
    await user.click(screen.getByLabelText('Deck list'));
    await user.paste(list);
    await user.click(screen.getByRole('button', { name: /Import 60 cards/ }));
    expect(screen.getByText('50/50 cards')).toBeTruthy();
  });

  it('starter decks are read-only', async () => {
    const user = setup();
    const starter = within(screen.getByText('Starter decks').closest('section')!).getAllByRole('button')[0]!;
    await user.click(starter);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(poolCards().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('deck builder: browsing', () => {
  it('shows 20 cards a page on a wide screen, and filters go back to page 1', async () => {
    const user = setup();
    await newDeck(user);
    expect(poolCards()).toHaveLength(20);
    const first = poolCards()[0]!.title;
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText(/Page 2 of/)).toBeTruthy();
    expect(poolCards()[0]!.title).not.toBe(first);
    await user.click(screen.getByRole('button', { name: 'Gear', pressed: false }));
    expect(screen.getByText(/Page 1 of/)).toBeTruthy();
  });

  it('on a phone: 18 cards a page, and the deck opens from a floating button', async () => {
    const user = setup(390);
    await newDeck(user);
    expect(poolCards()).toHaveLength(18);
    // No side panel; the deck is behind the button.
    expect(screen.queryByLabelText('Deck name')).toBeNull();
    await addCards(user, 2);
    await user.click(screen.getByRole('button', { name: /Open deck \(2 of 50 cards\)/ }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByLabelText('Deck name')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(stored()).toHaveLength(1);
  });
});
