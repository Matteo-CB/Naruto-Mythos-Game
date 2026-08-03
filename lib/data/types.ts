

export type RawRarity = 'C' | 'UC' | 'R' | 'RA' | 'S' | 'SV' | 'M' | 'MV' | 'L' | 'SP' | 'SPV' | 'POP' | 'POPV' | 'CHIBI' | 'CHIBIV' | 'SHINOBI' | 'SHINOBIV' | 'MMS';

export interface RawCardEffect {
  type: 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE';
  description: string;
  description_fr?: string;
}

export interface RawCardData {
  id: string;
  rarity: RawRarity;
  number: string;
  set: string;
  card_type: 'character' | 'mission';
  name_en: string;
  name_fr: string;
  title_fr: string;
  title_en: string;
  name_es?: string;
  title_es?: string;
  name_ja?: string;
  title_ja?: string;
  name_pt?: string;
  title_pt?: string;
  name_it?: string;
  title_it?: string;
  name_pl?: string;
  title_pl?: string;
  has_visual: boolean;
  chakra: number | '';
  power: number | '';
  keywords: string[];
  group: string;
  effects: RawCardEffect[];
  image_url: string;
  rarity_display: string;
  image_file: string;
  is_rare_art?: boolean;
  data_complete?: boolean;
  old_id?: string;
  basePoints?: number;
}
