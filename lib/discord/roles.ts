

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
  { key: 'academy_student', label: 'Academy Student', color: 0x888888, colorHex: '#888888', minElo: 0, hoist: true },
  { key: 'genin',           label: 'Genin',           color: 0x3E8B3E, colorHex: '#3E8B3E', minElo: 450, hoist: true },
  { key: 'chunin',          label: 'Chunin',          color: 0xB37E3E, colorHex: '#B37E3E', minElo: 550, hoist: true },
  { key: 'special_jonin',   label: 'Special Jonin',   color: 0x5A7ABB, colorHex: '#5A7ABB', minElo: 700, hoist: true },
  { key: 'elite_jonin',     label: 'Elite Jonin',     color: 0x5865F2, colorHex: '#5865F2', minElo: 1000, hoist: true },
  { key: 'legendary_sannin', label: 'Legendary Sannin', color: 0x9B59B6, colorHex: '#9B59B6', minElo: 1200, hoist: true },
  { key: 'kage',            label: 'Kage',            color: 0xC4A35A, colorHex: '#C4A35A', minElo: 1700, hoist: true },
  { key: 'sage',            label: 'Sage of Six Paths', color: 0xFFD700, colorHex: '#FFD700', minElo: 2000, hoist: true },
  { key: 'will_of_fire',   label: '꧁༒ 𝐖𝐢𝐥𝐥 𝐨𝐟 𝐅𝐢𝐫𝐞 ༒꧂', color: 0xFF6B35, colorHex: '#FF6B35', minElo: 2500, hoist: true },
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
