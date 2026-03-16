/**
 * ELO-based Discord role definitions.
 *
 * 8-tier Naruto-themed rank system. Roles are one-directional:
 * players only gain higher ranks, never lose them.
 */

export interface EloRole {
  name: string;
  color: number; // Discord color as integer
  colorHex: string; // CSS hex for website badges
  minElo: number;
  hoist: boolean;
}

/** Special role for players who haven't completed placement matches */
export const UNRANKED_ROLE: EloRole = {
  name: '\u257C Unranked \u257E', color: 0x555555, colorHex: '#555555', minElo: -1, hoist: true,
};

export const ELO_ROLES: EloRole[] = [
  { name: '\u257C Academy Student \u257E', color: 0x888888, colorHex: '#888888', minElo: 0, hoist: true },
  { name: '\u257C Genin \u257E',           color: 0x3E8B3E, colorHex: '#3E8B3E', minElo: 450, hoist: true },
  { name: '\u257C Chunin \u257E',          color: 0xB37E3E, colorHex: '#B37E3E', minElo: 550, hoist: true },
  { name: '\u257C Special Jonin \u257E',   color: 0x5A7ABB, colorHex: '#5A7ABB', minElo: 800, hoist: true },
  { name: '\u257C Elite Jonin \u257E',     color: 0x5865F2, colorHex: '#5865F2', minElo: 1000, hoist: true },
  { name: '\u257C Legendary Sannin \u257E', color: 0x9B59B6, colorHex: '#9B59B6', minElo: 1200, hoist: true },
  { name: '\u257C Kage \u257E',            color: 0xC4A35A, colorHex: '#C4A35A', minElo: 1600, hoist: true },
  { name: '\u257C Sage of Six Paths \u257E', color: 0xFFD700, colorHex: '#FFD700', minElo: 2000, hoist: true },
];

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
 * Get all ELO role names (for cleanup / identification).
 */
export function getAllEloRoleNames(): string[] {
  return [UNRANKED_ROLE.name, ...ELO_ROLES.map((r) => r.name)];
}

/**
 * Get the rank label (without Unicode decorations) for display.
 */
export function getRankLabel(elo: number): string {
  const role = getRoleForElo(elo);
  // Strip the ╼ and ╾ decorations
  return role.name.replace(/[╼╾]/g, '').trim();
}
