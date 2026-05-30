import { registerAllKSHandlers } from './KS/index';
import { registerAllSSHandlers } from './SS/index';
import { registerAllAKHandlers } from './AK/index';

export function registerAllSetHandlers(): void {
  registerAllKSHandlers();
  registerAllSSHandlers();
  registerAllAKHandlers();
}
