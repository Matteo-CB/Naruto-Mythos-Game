import { registerNaruto108Handlers } from './naruto108';
import { registerGaara120Handlers } from './gaara120';
import { registerSakura109Handlers } from './sakura109';

export function registerAllRareHandlers(): void {
  registerNaruto108Handlers();
  registerGaara120Handlers();
  registerSakura109Handlers();
}
