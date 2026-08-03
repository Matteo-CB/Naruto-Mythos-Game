import { registerMinato122Handlers } from './minato122';
import { registerSet2Handlers } from './set2';
import { registerTemari049Handlers } from './temari049';
import { registerSandVillageHandlers } from './sandVillage';
import { registerShinobiHandlers } from './shinobi';
import { registerSSMissionHandlers } from './missions/ssMissionHandlers';

export function registerAllSSHandlers(): void {
  registerMinato122Handlers();
  registerSet2Handlers();
  registerTemari049Handlers();
  registerSandVillageHandlers();
  registerShinobiHandlers();
  registerSSMissionHandlers();
}
