import type { EffectContext, EffectResult } from './EffectTypes';
import type { EffectType } from '@/lib/engine/types';
import { envelopperResultat } from './autoConfirm';
import { annoncerEffetResolu } from '@/lib/quests/effetResolu';
import { avecSource } from '@/lib/quests/sourceCourante';
import { annoncerJetonsRetires } from '@/lib/quests/jetonsRetires';

// Point de passage unique de tous les effets de carte. Il resout l effet, applique la
// confirmation automatique, puis annonce le fait aux quetes. Une garde interdit d appeler
// un handler directement, pour qu une carte ajoutee demain soit branchee sans y penser.
export function resoudreEffetAvecQuete(
  handler: (ctx: EffectContext) => EffectResult,
  ctx: EffectContext,
  effectType: EffectType,
  sourceExplicite?: { cardId?: string; name?: string },
): EffectResult {
  const source = ctx.sourceCard as {
    card?: { id?: string; name_fr?: string; name_en?: string };
    stack?: Array<{ id?: string; name_fr?: string; name_en?: string }>;
  } | undefined;
  const duHote = source?.stack && source.stack.length > 0
    ? source.stack[source.stack.length - 1]
    : source?.card;
  // Un equipement agit en son nom propre, pas au nom du personnage qui le porte.
  const sommet = sourceExplicite?.cardId
    ? { id: sourceExplicite.cardId, name_fr: sourceExplicite.name, name_en: sourceExplicite.name }
    : duHote;

  const resultat = avecSource(
    sommet?.id ? { cardId: sommet.id, name: sommet.name_fr ?? sommet.name_en } : null,
    () => envelopperResultat(handler(ctx), ctx, effectType),
  );

  annoncerEffetResolu(resultat.state ?? ctx.state, ctx.sourcePlayer, effectType, {
    cardId: sommet?.id,
    name: sommet?.name_fr ?? sommet?.name_en,
    missionIndex: ctx.sourceMissionIndex,
  });

  annoncerJetonsRetires(ctx.state, resultat.state ?? ctx.state, ctx.sourcePlayer);

  return resultat;
}
