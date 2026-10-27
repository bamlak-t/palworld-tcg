import { registerScripts } from '../abilities.ts';
import { EBP01 } from './ebp01.ts';
import { EBP02 } from './ebp02.ts';
import { ESS01 } from './ess01.ts';
import { ETD01, ETD02 } from './trialDecks.ts';

registerScripts({ ...ETD01, ...ETD02, ...EBP01, ...EBP02, ...ESS01 });
