import { registerItachi143Handlers } from './itachi143';
import { registerKisame144Handlers } from './kisame144';

export function registerAllMythosHandlers(): void {
  registerItachi143Handlers();
  registerKisame144Handlers();
}
