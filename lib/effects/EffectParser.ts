/**
 * Effect text parser for card effect descriptions.
 *
 * Parses the markup found in card effect description strings from the JSON data
 * (naruto_mythos_tcg_complete.json). Recognized markup includes:
 *
 *   [⧗]              - Continuous/passive effect indicator
 *   [↯]              - SCORE effect indicator
 *   [u]Name[/u]      - Character name reference (rendered as bold/underline in UI)
 *   POWERUP X        - Place X power tokens (X may be a number or variable like "X")
 *   CHAKRA +X        - Provides X extra chakra during Start Phase
 *   effect:          - Prefix indicating the MAIN modifies a preceding MAIN (used by UPGRADE cards)
 */

// ---------------------
// Types
// ---------------------

export interface ParsedEffect {
  /** Whether the description contains the [⧗] continuous/passive indicator. */
  isContinuous: boolean;
  /** Whether the description contains the [↯] SCORE indicator. */
  isScore: boolean;
  /** Whether the description starts with "effect:" (a MAIN that modifies the preceding MAIN). */
  isEffectModifier: boolean;
  /** The numeric value from "POWERUP X", or null if not present. null if X is a variable. */
  powerupValue: number | null;
  /** The numeric value from "CHAKRA +X", or null if not present. */
  chakraBonus: number | null;
  /** Character names extracted from [u]...[/u] tags. */
  characterReferences: string[];
  /** The description text with all markup tags removed. */
  cleanDescription: string;
}

// ---------------------
// Regex Patterns
// ---------------------

/** Matches the [⧗] continuous effect symbol. */
const CONTINUOUS_PATTERN = /\[⧗\]/g;

/** Matches the [↯] SCORE effect symbol. */
const SCORE_PATTERN = /\[↯\]/g;

/** Matches character name references: [u]Character Name[/u]. */
const CHARACTER_REF_PATTERN = /\[u\](.*?)\[\/u\]/g;

/**
 * Matches POWERUP followed by a number.
 * Captures the numeric value. Does not match variable references like "POWERUP X"
 * where X is described elsewhere.
 */
const POWERUP_NUMERIC_PATTERN = /POWERUP\s+(\d+)/i;

/**
 * Matches CHAKRA +X where X is a number.
 * Captures the numeric value.
 */
const CHAKRA_BONUS_PATTERN = /CHAKRA\s*\+\s*(\d+)/i;

/**
 * Matches the "effect:" prefix at the start of the description (ignoring leading whitespace).
 */
const EFFECT_MODIFIER_PATTERN = /^\s*effect\s*:/i;

// ---------------------
// Parser
// ---------------------

/**
 * Parse a card effect description string and extract structured information.
 *
 * @param description - The raw effect description string from the card data.
 * @returns A ParsedEffect object with extracted properties.
 */
export function parseEffectText(description: string): ParsedEffect {
  const isContinuous = description.includes('[⧗]');
  const isScore = description.includes('[↯]');
  const isEffectModifier = EFFECT_MODIFIER_PATTERN.test(description);

  // Extract POWERUP value (numeric only; variable X returns null)
  const powerupMatch = description.match(POWERUP_NUMERIC_PATTERN);
  const powerupValue = powerupMatch ? parseInt(powerupMatch[1], 10) : null;

  // Extract CHAKRA +X value
  const chakraBonusMatch = description.match(CHAKRA_BONUS_PATTERN);
  const chakraBonus = chakraBonusMatch ? parseInt(chakraBonusMatch[1], 10) : null;

  // Extract character name references from [u]...[/u] tags
  const characterReferences: string[] = [];
  let charRefMatch: RegExpExecArray | null;
  // Reset lastIndex since we use the global flag
  CHARACTER_REF_PATTERN.lastIndex = 0;
  while ((charRefMatch = CHARACTER_REF_PATTERN.exec(description)) !== null) {
    characterReferences.push(charRefMatch[1]);
  }

  // Build clean description by removing all markup
  let cleanDescription = description;
  cleanDescription = cleanDescription.replace(CONTINUOUS_PATTERN, '');
  cleanDescription = cleanDescription.replace(SCORE_PATTERN, '');
  cleanDescription = cleanDescription.replace(/\[u\](.*?)\[\/u\]/g, '$1');
  cleanDescription = cleanDescription.replace(EFFECT_MODIFIER_PATTERN, '');
  // Collapse multiple spaces and trim
  cleanDescription = cleanDescription.replace(/\s{2,}/g, ' ').trim();

  return {
    isContinuous,
    isScore,
    isEffectModifier,
    powerupValue,
    chakraBonus,
    characterReferences,
    cleanDescription,
  };
}
