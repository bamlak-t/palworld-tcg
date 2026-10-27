import { registerScripts } from '../abilities.ts';
import { EBP01 } from './ebp01.ts';
import { ETD01, ETD02 } from './trialDecks.ts';

registerScripts({ ...ETD01, ...ETD02, ...EBP01 });
