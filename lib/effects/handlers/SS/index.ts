import { registerMinato122Handlers } from './minato122';
import { registerSet2Handlers } from './set2';

export function registerAllSSHandlers(): void {
  registerMinato122Handlers();
  registerSet2Handlers();
}
