// Raw JSON types matching the card data files

export type RawRarity = 'C' | 'UC' | 'R' | 'RA' | 'S' | 'M' | 'Legendary' | 'Mission';

export interface RawCardEffect {
  type: 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE';
  description: string;
}

export interface RawCardData {
  id: string;
  number: number;
  name_fr: string;
  title_fr?: string;
  name_en?: string;
  rarity: RawRarity;
  card_type: 'character' | 'mission';
  has_visual: boolean;
  chakra?: number;
  power?: number;
  keywords?: string[];
  group?: string;
  effects?: RawCardEffect[];
  image_url?: string;
  rarity_display?: string;
  image_file?: string;
  is_rare_art?: boolean;
  numbering?: string;
  limited_edition?: number;
}
