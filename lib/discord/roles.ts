/**
 * ELO-based Discord role definitions.
 *
 * 8-tier Naruto-themed rank system + Unranked.
 * Roles are identified by a fixed `key` (never changes).
 * Discord role IDs are stored in the database so role names
 * can be freely changed on Discord without breaking sync.
 */

export interface EloRole {
  key: string;        // Fixed identifier (never changes)
  label: string;      // Display label for the website
  color: number;      // Discord color as integer
  colorHex: string;   // CSS hex for website badges
  minElo: number;
  hoist: boolean;
}

/** Special role for players who haven't completed placement matches */
export const UNRANKED_ROLE: EloRole = {
  key: 'unranked', label: 'Unranked', color: 0x555555, colorHex: '#555555', minElo: -1, hoist: true,
};

export const ELO_ROLES: EloRole[] = [
  { key: 'academy_student', label: 'Academy Student', color: 0x888888, colorHex: '#888888', minElo: 0, hoist: true },
  { key: 'genin',           label: 'Genin',           color: 0x3E8B3E, colorHex: '#3E8B3E', minElo: 450, hoist: true },
  { key: 'chunin',          label: 'Chunin',          color: 0xB37E3E, colorHex: '#B37E3E', minElo: 550, hoist: true },
  { key: 'special_jonin',   label: 'Special Jonin',   color: 0x5A7ABB, colorHex: '#5A7ABB', minElo: 800, hoist: true },
  { key: 'elite_jonin',     label: 'Elite Jonin',     color: 0x5865F2, colorHex: '#5865F2', minElo: 1000, hoist: true },
  { key: 'legendary_sannin', label: 'Legendary Sannin', color: 0x9B59B6, colorHex: '#9B59B6', minElo: 1200, hoist: true },
  { key: 'kage',            label: 'Kage',            color: 0xC4A35A, colorHex: '#C4A35A', minElo: 1600, hoist: true },
  { key: 'sage',            label: 'Sage of Six Paths', color: 0xFFD700, colorHex: '#FFD700', minElo: 2000, hoist: true },
];

/** All roles including unranked */
export const ALL_ELO_ROLES: EloRole[] = [UNRANKED_ROLE, ...ELO_ROLES];

export const PLACEMENT_MATCHES_REQUIRED = 5;

/**
 * Get the role definition matching a given ELO.
 * Returns the highest tier the ELO qualifies for.
 */
export function getRoleForElo(elo: number): EloRole {
  let matched = ELO_ROLES[0];
  for (const role of ELO_ROLES) {
    if (elo >= role.minElo) {
      matched = role;
    }
  }
  return matched;
}

/**
 * Get all ELO role keys.
 */
export function getAllEloRoleKeys(): string[] {
  return ALL_ELO_ROLES.map((r) => r.key);
}

/**
 * Get all ELO role labels (used for name-based matching on Discord).
 */
export function getAllEloRoleNames(): string[] {
  return ALL_ELO_ROLES.map((r) => r.label);
}

/**
 * Get the rank label for display on the website.
 */
export function getRankLabel(elo: number): string {
  return getRoleForElo(elo).label;
}

/**
 * Find a role definition by its key.
 */
export function getRoleByKey(key: string): EloRole | undefined {
  return ALL_ELO_ROLES.find((r) => r.key === key);
}
