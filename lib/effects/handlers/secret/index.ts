import { registerNaruto133Handlers } from './naruto133';
import { registerSakura135Handlers } from './sakura135';
import { registerSasuke136Handlers } from './sasuke136';
import { registerKakashi137Handlers } from './kakashi137';

export function registerAllSecretHandlers(): void {
  registerNaruto133Handlers();
  registerSakura135Handlers();
  registerSasuke136Handlers();
  registerKakashi137Handlers();
}
