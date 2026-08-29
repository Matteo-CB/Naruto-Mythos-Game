

import { seuilDEntree } from '@/lib/leagues/paliers';

export const CLE_DE_LIGUE: Readonly<Record<string, string>> = {
  academy_student: 'academyStudent',
  genin: 'genin',
  chunin: 'chunin',
  special_jonin: 'specialJonin',
  elite_jonin: 'eliteJonin',
  legendary_sannin: 'legendarySannin',
  kage: 'kage',
  sage: 'sageOfSixPaths',
  will_of_fire: 'willOfFire',
};

export interface EloRole {
  key: string;        // Fixed identifier (never changes)
  label: string;      // Display label for the website
  color: number;      // Discord color as integer
  colorHex: string;   // CSS hex for website badges
  minElo: number;
  hoist: boolean;
}


export const UNRANKED_ROLE: EloRole = {
  key: 'unranked', label: 'Unranked', color: 0x555555, colorHex: '#555555', minElo: -1, hoist: true,
};

export const ELO_ROLES: EloRole[] = [
  { key: 'academy_student', label: 'Academy Student', color: 0x888888, colorHex: '#888888', minElo: seuilDEntree(CLE_DE_LIGUE.academy_student), hoist: true },
  { key: 'genin',           label: 'Genin',           color: 0x3E8B3E, colorHex: '#3E8B3E', minElo: seuilDEntree(CLE_DE_LIGUE.genin), hoist: true },
  { key: 'chunin',          label: 'Chunin',          color: 0xB37E3E, colorHex: '#B37E3E', minElo: seuilDEntree(CLE_DE_LIGUE.chunin), hoist: true },
  { key: 'special_jonin',   label: 'Special Jonin',   color: 0x5A7ABB, colorHex: '#5A7ABB', minElo: seuilDEntree(CLE_DE_LIGUE.special_jonin), hoist: true },
  { key: 'elite_jonin',     label: 'Elite Jonin',     color: 0x5865F2, colorHex: '#5865F2', minElo: seuilDEntree(CLE_DE_LIGUE.elite_jonin), hoist: true },
  { key: 'legendary_sannin', label: 'Legendary Sannin', color: 0x9B59B6, colorHex: '#9B59B6', minElo: seuilDEntree(CLE_DE_LIGUE.legendary_sannin), hoist: true },
  { key: 'kage',            label: 'Kage',            color: 0xC4A35A, colorHex: '#C4A35A', minElo: seuilDEntree(CLE_DE_LIGUE.kage), hoist: true },
  { key: 'sage',            label: 'Sage of Six Paths', color: 0xFFD700, colorHex: '#FFD700', minElo: seuilDEntree(CLE_DE_LIGUE.sage), hoist: true },
  { key: 'will_of_fire',   label: '꧁༒ 𝐖𝐢𝐥𝐥 𝐨𝐟 𝐅𝐢𝐫𝐞 ༒꧂', color: 0xFF6B35, colorHex: '#FF6B35', minElo: seuilDEntree(CLE_DE_LIGUE.will_of_fire), hoist: true },
];


export const ALL_ELO_ROLES: EloRole[] = [UNRANKED_ROLE, ...ELO_ROLES];

export const PLACEMENT_MATCHES_REQUIRED = 5;


export function getRoleForElo(elo: number): EloRole {
  let matched = ELO_ROLES[0];
  for (const role of ELO_ROLES) {
    if (elo >= role.minElo) {
      matched = role;
    }
  }
  return matched;
}


export function getAllEloRoleKeys(): string[] {
  return ALL_ELO_ROLES.map((r) => r.key);
}


export function getAllEloRoleNames(): string[] {
  return ALL_ELO_ROLES.map((r) => r.label);
}


export function getRankLabel(elo: number): string {
  return getRoleForElo(elo).label;
}


export function getRoleByKey(key: string): EloRole | undefined {
  return ALL_ELO_ROLES.find((r) => r.key === key);
}
