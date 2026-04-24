





export interface ParsedEffect {
  
  isContinuous: boolean;
  
  isScore: boolean;
  
  isEffectModifier: boolean;
  
  powerupValue: number | null;
  
  chakraBonus: number | null;
  
  characterReferences: string[];
  
  cleanDescription: string;
}






const CONTINUOUS_PATTERN = /\[⧗\]/g;


const SCORE_PATTERN = /\[↯\]/g;


const CHARACTER_REF_PATTERN = /\[u\](.*?)\[\/u\]/g;


const POWERUP_NUMERIC_PATTERN = /POWERUP\s+(\d+)/i;


const CHAKRA_BONUS_PATTERN = /CHAKRA\s*\+\s*(\d+)/i;


const EFFECT_MODIFIER_PATTERN = /^\s*effect\s*:/i;






export function parseEffectText(description: string): ParsedEffect {
  const isContinuous = description.includes('[⧗]');
  const isScore = description.includes('[↯]');
  const isEffectModifier = EFFECT_MODIFIER_PATTERN.test(description);

  
  const powerupMatch = description.match(POWERUP_NUMERIC_PATTERN);
  const powerupValue = powerupMatch ? parseInt(powerupMatch[1], 10) : null;

  
  const chakraBonusMatch = description.match(CHAKRA_BONUS_PATTERN);
  const chakraBonus = chakraBonusMatch ? parseInt(chakraBonusMatch[1], 10) : null;

  
  const characterReferences: string[] = [];
  let charRefMatch: RegExpExecArray | null;
  
  CHARACTER_REF_PATTERN.lastIndex = 0;
  while ((charRefMatch = CHARACTER_REF_PATTERN.exec(description)) !== null) {
    characterReferences.push(charRefMatch[1]);
  }

  
  let cleanDescription = description;
  cleanDescription = cleanDescription.replace(CONTINUOUS_PATTERN, '');
  cleanDescription = cleanDescription.replace(SCORE_PATTERN, '');
  cleanDescription = cleanDescription.replace(/\[u\](.*?)\[\/u\]/g, '$1');
  cleanDescription = cleanDescription.replace(EFFECT_MODIFIER_PATTERN, '');
  
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
