import { registerMinato122Handlers } from './minato122';
import { registerSet2Handlers } from './set2';
import { registerTemari049Handlers } from './temari049';
import { registerSandVillageHandlers } from './sandVillage';
import { registerShinobiHandlers } from './shinobi';
import { registerKimimaro031Handlers } from './kimimaro031';
import { registerLegendaryGoldHandlers } from './legendaryGold';
import { registerItachi053Handlers } from './itachi053';
import { registerKakashi008Handlers } from './kakashi008';
import { registerJirobo033Handlers } from './jirobo033';
import { registerKyubi006Handlers } from './kyubi006';
import { registerTsunade002Handlers } from './tsunade002';
import { registerSenbonRamenHandlers } from './senbonRamen';
import { registerNaruto005Handlers } from './naruto005';
import { registerRegionalChampionshipHandlers } from './regionalChampionship';
import { registerShikamaru118Handlers } from './shikamaru118';
import { registerSecretVariantHandlers } from './secretVariants';
import { registerSSMissionHandlers } from './missions/ssMissionHandlers';

export function registerAllSSHandlers(): void {
  registerMinato122Handlers();
  registerSet2Handlers();
  registerTemari049Handlers();
  registerSandVillageHandlers();
  registerShinobiHandlers();
  registerKimimaro031Handlers();
  registerLegendaryGoldHandlers();
  registerItachi053Handlers();
  registerKakashi008Handlers();
  registerJirobo033Handlers();
  registerKyubi006Handlers();
  registerTsunade002Handlers();
  registerSenbonRamenHandlers();
  registerNaruto005Handlers();
  registerRegionalChampionshipHandlers();
  registerShikamaru118Handlers();
  registerSecretVariantHandlers();
  registerSSMissionHandlers();
}
