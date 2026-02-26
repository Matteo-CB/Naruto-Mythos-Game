/**
 * KS (Konoha Shido) set handler registration.
 * Imports and registers all effect handlers for the KS card set.
 */
import { registerAllCommonHandlers } from './common/index';
import { registerAllUncommonHandlers } from './uncommon/index';
import { registerAllRareHandlers } from './rare/index';
import { registerAllSecretHandlers } from './secret/index';
import { registerAllMythosHandlers } from './mythos/index';
import { registerAllMissionHandlers } from './missions/index';
import { registerAllLegendaryHandlers } from './legendary/index';

export function registerAllKSHandlers(): void {
  registerAllCommonHandlers();
  registerAllUncommonHandlers();
  registerAllRareHandlers();
  registerAllSecretHandlers();
  registerAllMythosHandlers();
  registerAllMissionHandlers();
  registerAllLegendaryHandlers();
}
