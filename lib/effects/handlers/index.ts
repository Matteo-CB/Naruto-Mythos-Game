import { registerAllKSHandlers } from './KS/index';
import { registerAllSSHandlers } from './SS/index';
import { registerAllAKHandlers } from './AK/index';
import { propagateHandlersAcrossPrintings } from './printingParity';

export function registerAllSetHandlers(): void {
  registerAllKSHandlers();
  registerAllSSHandlers();
  registerAllAKHandlers();
  propagateHandlersAcrossPrintings();
}
