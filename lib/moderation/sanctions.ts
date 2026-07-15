import { prisma } from '@/lib/db/prisma';

export type SanctionType =
  | 'warn'
  | 'warn_severe'
  | 'mute_chat'
  | 'shadow_mute'
  | 'ranked_ban'
  | 'suspension'
  | 'spectate_ban'
  | 'name_reset'
  | 'message_delete'
  | 'elo_adjust';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const SANCTION_DURATIONS: Record<SanctionType, ReadonlyArray<number | null>> = {
  warn: [],
  warn_severe: [],
  mute_chat: [HOUR_MS, DAY_MS, 7 * DAY_MS, null],
  shadow_mute: [HOUR_MS, DAY_MS, 7 * DAY_MS, null],
  ranked_ban: [DAY_MS, 7 * DAY_MS, null],
  suspension: [DAY_MS, 7 * DAY_MS, 30 * DAY_MS, null],
  spectate_ban: [DAY_MS, 7 * DAY_MS, null],
  name_reset: [],
  message_delete: [],
  elo_adjust: [],
};

export const STATEFUL_SANCTION_TYPES: ReadonlySet<SanctionType> = new Set([
  'mute_chat', 'shadow_mute', 'ranked_ban', 'suspension', 'spectate_ban',
]);

export interface SanctionLike {
  type: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ModerationFlags {
  muted: boolean;
  mutedUntil: Date | null;
  shadowMuted: boolean;
  shadowMutedUntil: Date | null;
  suspended: boolean;
  suspendedUntil: Date | null;
  rankedBanned: boolean;
  rankedBannedUntil: Date | null;
  spectateBanned: boolean;
  spectateBannedUntil: Date | null;
}

export const CLEAN_FLAGS: ModerationFlags = {
  muted: false, mutedUntil: null,
  shadowMuted: false, shadowMutedUntil: null,
  suspended: false, suspendedUntil: null,
  rankedBanned: false, rankedBannedUntil: null,
  spectateBanned: false, spectateBannedUntil: null,
};

export function isSanctionActive(s: SanctionLike, now: Date): boolean {
  if (!STATEFUL_SANCTION_TYPES.has(s.type as SanctionType)) return false;
  if (s.revokedAt) return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function isValidSanctionDuration(type: SanctionType, durationMs: number | null): boolean {
  const allowed = SANCTION_DURATIONS[type];
  if (allowed.length === 0) return durationMs === null;
  return allowed.some((d) => d === durationMs);
}

function laterUntil(current: Date | null, candidate: Date | null, currentActive: boolean): Date | null {
  if (!currentActive) return candidate;
  if (current === null || candidate === null) return null;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

export function computeModerationFlags(sanctions: SanctionLike[], now: Date): ModerationFlags {
  const flags: ModerationFlags = { ...CLEAN_FLAGS };
  for (const s of sanctions) {
    if (!isSanctionActive(s, now)) continue;
    switch (s.type as SanctionType) {
      case 'mute_chat':
        flags.mutedUntil = laterUntil(flags.mutedUntil, s.expiresAt, flags.muted);
        flags.muted = true;
        break;
      case 'shadow_mute':
        flags.shadowMutedUntil = laterUntil(flags.shadowMutedUntil, s.expiresAt, flags.shadowMuted);
        flags.shadowMuted = true;
        break;
      case 'suspension':
        flags.suspendedUntil = laterUntil(flags.suspendedUntil, s.expiresAt, flags.suspended);
        flags.suspended = true;
        break;
      case 'ranked_ban':
        flags.rankedBannedUntil = laterUntil(flags.rankedBannedUntil, s.expiresAt, flags.rankedBanned);
        flags.rankedBanned = true;
        break;
      case 'spectate_ban':
        flags.spectateBannedUntil = laterUntil(flags.spectateBannedUntil, s.expiresAt, flags.spectateBanned);
        flags.spectateBanned = true;
        break;
    }
  }
  return flags;
}

const FLAGS_CACHE_TTL_MS = 60 * 1000;
const flagsCache = new Map<string, { at: number; flags: ModerationFlags }>();

export function invalidateModerationCache(userId?: string): void {
  if (userId) flagsCache.delete(userId);
  else flagsCache.clear();
}

export async function getModerationFlags(userId: string): Promise<ModerationFlags> {
  const cached = flagsCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.at < FLAGS_CACHE_TTL_MS) return cached.flags;

  const sanctions = await prisma.sanction.findMany({
    where: { userId, revokedAt: null, type: { in: [...STATEFUL_SANCTION_TYPES] } },
    select: { type: true, expiresAt: true, revokedAt: true },
  });
  const flags = computeModerationFlags(sanctions, new Date(now));
  flagsCache.set(userId, { at: now, flags });
  return flags;
}

export async function isMuted(userId: string): Promise<boolean> {
  return (await getModerationFlags(userId)).muted;
}

export async function isShadowMuted(userId: string): Promise<boolean> {
  return (await getModerationFlags(userId)).shadowMuted;
}

export async function isSuspended(userId: string): Promise<boolean> {
  return (await getModerationFlags(userId)).suspended;
}

export async function isRankedBanned(userId: string): Promise<boolean> {
  return (await getModerationFlags(userId)).rankedBanned;
}

export async function isSpectateBanned(userId: string): Promise<boolean> {
  return (await getModerationFlags(userId)).spectateBanned;
}

export interface ApplySanctionInput {
  userId: string;
  username: string;
  type: SanctionType;
  reason: string;
  issuedBy: string;
  issuedByName: string;
  durationMs: number | null;
  reportId?: string | null;
}

export async function applySanction(input: ApplySanctionInput) {
  if (!isValidSanctionDuration(input.type, input.durationMs)) {
    throw new Error(`invalid duration for sanction type ${input.type}`);
  }
  const sanction = await prisma.sanction.create({
    data: {
      userId: input.userId,
      username: input.username,
      type: input.type,
      reason: input.reason,
      reportId: input.reportId ?? null,
      issuedBy: input.issuedBy,
      issuedByName: input.issuedByName,
      expiresAt: input.durationMs === null ? null : new Date(Date.now() + input.durationMs),
    },
  });
  if (input.type === 'name_reset') {
    await prisma.user.update({ where: { id: input.userId }, data: { usernameResetRequired: true } });
  }
  invalidateModerationCache(input.userId);
  return sanction;
}

export async function revokeSanction(sanctionId: string): Promise<void> {
  const sanction = await prisma.sanction.update({
    where: { id: sanctionId },
    data: { revokedAt: new Date() },
  });
  invalidateModerationCache(sanction.userId);
}

export async function getSanctionHistory(userId: string) {
  return prisma.sanction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}
