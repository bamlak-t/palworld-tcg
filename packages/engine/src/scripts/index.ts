import { registerScripts } from '../abilities.ts';
import { ETD01, ETD02 } from './trialDecks.ts';

registerScripts({ ...ETD01, ...ETD02 });
