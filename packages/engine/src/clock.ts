/**
 * The move clock for timed games. The turn player has `turnSeconds` for their whole
 * turn; while the opponent is responding (block, quick step, a choice) that clock pauses
 * and the opponent gets their own `turnSeconds` for the response. Pure: callers pass
 * the current time, so the server and local games share it.
 */
import type { GameState, Seat } from './types.ts';

export interface Clock {
  turn: number;
  /** Who must act now. */
  seat: Seat;
  /** When `seat` started thinking (ms since epoch). */
  startedAt: number;
  /** Time the turn player has already used this turn, before `startedAt` (ms). */
  turnPlayerSpentMs: number;
}

/** Whose move it is: the player a choice is waiting on, or the turn player. */
export const actingSeat = (s: GameState): Seat => s.pending?.seat ?? s.activeSeat;

/** The clock after the game moved to state `s`. */
export function advanceClock(prev: Clock | null, s: GameState, now: number): Clock | null {
  if (s.result) return null;
  const seat = actingSeat(s);
  if (!prev || prev.turn !== s.turn) return { turn: s.turn, seat, startedAt: now, turnPlayerSpentMs: 0 };
  if (prev.seat === seat) return prev;
  // Handing over: bank the turn player's time; a responder always starts fresh.
  const spent = prev.seat === s.activeSeat ? prev.turnPlayerSpentMs + (now - prev.startedAt) : prev.turnPlayerSpentMs;
  return { turn: s.turn, seat, startedAt: now, turnPlayerSpentMs: spent };
}

/** When the acting player runs out of time (ms since epoch). */
export function deadline(clock: Clock, s: GameState, turnSeconds: number): number {
  const budget = turnSeconds * 1000 - (clock.seat === s.activeSeat ? clock.turnPlayerSpentMs : 0);
  return clock.startedAt + Math.max(0, budget);
}
