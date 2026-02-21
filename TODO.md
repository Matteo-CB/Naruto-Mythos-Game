# Naruto Mythos TCG - Remaining Work

## What's Done (This Session)

### Bug Fixes
- Fixed `deckBuilderStore.ts` + `socialStore.ts`: added `credentials: 'include'` to all fetch calls (was causing 401 Unauthorized)
- Fixed Kidomaru 124 `isUpgrade` reference error in AMBUSH handler
- Fixed Neji 116 + Temari 121 UPGRADE logic (now independent handlers, not modifiers)
- Fixed 5 mission SCORE handlers (MSS 01, 03, 04, 05, 07) to support target selection when multiple valid targets
- Fixed 6 common handler bugs (Iruka 047, Jiraiya 008, Shino 033, Kabuto 052, Pakkun 099, Hinata 030)
- Fixed ContinuousEffects.ts (Shizune 005 CHAKRA+1, Sakura 012 CHAKRA+1, Gai 043 token retention)

### New Features
- Added 35+ missing `applyTargetedEffect` switch cases in EffectEngine.ts
- Created `effectDescriptionsEn.ts` (English translation file for all card effects)
- Added 110/130 INO YAMANAKA (R): stats (chakra 5, power 4), effects, handler, EN/FR translations
- Improved powerup token visuals (larger, metallic look, glow scales with count)
- Improved upgrade indicator (green badge with stack count)
- Improved upgrade + powertoken animations

### Images Added
- 30+ new card images (UC, R, RA, S, M, Mission)

---

## What Remains To Do

### Priority 1: Card Stats Audit (ALL 166 owned cards)

Many cards in the JSON (`naruto_mythos_tcg_complete.json`) have missing or zero stats (chakra, power, keywords, group). Every owned card needs:
- Correct **chakra cost** and **power** values
- Correct **keywords** (Team 7, Summon, Sound Four, etc.)
- Correct **group** (Leaf Village, Sand Village, etc.)
- Correct **effects** array with proper type and description

**Cards already corrected** (via `STAT_CORRECTIONS` / `EFFECT_CORRECTIONS` in `cardLoader.ts`):
- 108/130, 108/130 A (Naruto R/RA)
- 109/130 (Sakura R)
- 110/130, 110/130 A (Ino R/RA) -- NEW
- 112/130 (Choji R)
- 120/130, 120/130 A (Gaara R/RA)
- 133/130 (Naruto S)
- 135/130 (Sakura S)
- 137/130 (Kakashi S)
- Legendary

**Cards to NOT implement** (user doesn't own):
- 004/130, 045/130, 073/130, 076/130, 112/130, 115/130, 122/130, 124/130, 127/130, 128/130, 129/130, 130/130
- 115/130 A, 116/130 A, 122/130 A, 124/130 A, 126/130 A, 127/130 A, 129/130 A
- 134/130

**What to do**: Go through every card in the JSON that is NOT on the exclusion list. For any card with `chakra: 0`, `power: 0`, or missing `effects`/`keywords`/`group`, add corrections in `cardLoader.ts`. The user must provide the actual card stats since they can't be scraped.

### Priority 2: Missing Effect Handlers

Some non-playable cards (no image) have handlers created for future use. But verify:
- ALL playable cards (has_visual=true) with effects have working handlers
- All handler logic matches the card's effect description exactly
- All handlers with target selection have matching `applyTargetedEffect` cases in `EffectEngine.ts`

**Known gap**: Ino 110 handler (`ino110.ts`) has an auto-resolve code path that returns a non-standard result type. Should be refactored to always use the two-stage target selection pattern (choose enemy -> choose destination).

### Priority 3: Wire English Translations into UI

The file `lib/data/effectDescriptionsEn.ts` was created with English translations for all cards, but the UI components may not use it yet for English locale. Check and update:
- `components/cards/CardFace.tsx`
- `components/cards/CardPreview.tsx`
- `app/[locale]/collection/page.tsx`

Pattern needed:
```typescript
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
const descriptions = locale === 'fr' ? effectDescriptionsFr : effectDescriptionsEn;
const desc = descriptions[card.id]?.[i] ?? effect.description;
```

### Priority 4: Missing Card Images

Many UC/R/RA/S/M cards still don't have images (`has_visual: false`). The bruteforce scripts in `scripts/` attempted CDN URL patterns. Remaining missing images should be sourced manually or from new scraping approaches.

Key missing images include most UC cards, several R/RA cards, and some S/M cards. Check `naruto_mythos_tcg_complete.json` for cards with `has_visual: false`.

### Priority 5: Game Polish

- **Card animations**: Some effects (move, hide, defeat) don't have smooth in-game animations yet
- **Target selection UI**: Verify all target selection types show clear UI prompts to the player
- **AI evaluation**: Expert AI should factor in Ino 110's move effect, and any other new card effects
- **Game log i18n**: Verify all `game.log.effect.*` and `game.log.score.*` keys exist in `messages/en.json` and `messages/fr.json`
- **Deck builder validation**: Ensure new playable cards (with newly added images) appear in the deck builder
- **Sound effects**: No sounds implemented yet

### Priority 6: Cleanup

- Remove `CARDS_EFFECTS_CHECKLIST.txt` (superseded by this file)
- Clean up `scripts/` directory (many temp bruteforce result files)
- Remove duplicate card images (some cards have both old and new naming conventions)

---

## Architecture Notes

- Effect handlers: `lib/effects/handlers/{common,uncommon,rare,secret,mythos,missions,legendary}/`
- Effect registry: `registerEffect(cardId, effectType, handler)` in `lib/effects/EffectRegistry.ts`
- RA variants reuse R handlers via ID normalization (strip " A" suffix)
- UPGRADE logic: Some integrated into MAIN handler via `isUpgrade` flag, some are standalone
- Target selection flow: handler returns `requiresTargetSelection: true` -> `PendingEffect` -> UI -> `applyTargetedEffect`
- Continuous effects: `ContinuousEffects.ts` (chakra bonus, power modifiers, token retention, etc.)
- Stat corrections: `STAT_CORRECTIONS` / `EFFECT_CORRECTIONS` / `KEYWORD_CORRECTIONS` in `cardLoader.ts`
