import { registerAllKSHandlers } from './KS/index';
import { registerAllSSHandlers } from './SS/index';

export function registerAllSetHandlers(): void {
  registerAllKSHandlers();
  registerAllSSHandlers();
}
