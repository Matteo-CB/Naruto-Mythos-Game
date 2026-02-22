import { registerMss01Handlers } from './mss01';
import { registerMss02Handlers } from './mss02';
import { registerMss03Handlers } from './mss03';
import { registerMss04Handlers } from './mss04';
import { registerMss05Handlers } from './mss05';
import { registerMss06Handlers } from './mss06';
import { registerMss07Handlers } from './mss07';
import { registerMss08Handlers } from './mss08';
import { registerMss09Handlers } from './mss09';
import { registerMss10Handlers } from './mss10';

export function registerAllMissionHandlers(): void {
  registerMss01Handlers();
  registerMss02Handlers();
  registerMss03Handlers();
  registerMss04Handlers();
  registerMss05Handlers();
  registerMss06Handlers();
  registerMss07Handlers();
  registerMss08Handlers();
  registerMss09Handlers();
  registerMss10Handlers();
}
