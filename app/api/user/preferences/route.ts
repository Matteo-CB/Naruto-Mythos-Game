import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { COUNTRY_CODES } from '@/lib/data/countries';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';
import { normalizeChatVisibility } from '@/lib/chat/chatRules';
import { validateStoredBoardPalette } from '@/lib/game/boardPalette';

export const DECK_LIST_LIMIT_MIN = 3;
export const DECK_LIST_LIMIT_MAX = 200;
export const DECK_LIST_LIMIT_DEFAULT = 20;
export const MAX_FAVORITE_DECKS = 3;

async function readDeckPrefs(userId: string): Promise<{ deckListLimit: number; favoriteDeckIds: string[] }> {
  try {
    const raw = await prisma.$runCommandRaw({
      find: 'User',
      filter: { _id: { $oid: userId } },
      projection: { deckListLimit: 1, favoriteDeckIds: 1 },
      limit: 1,
    }) as { cursor?: { firstBatch?: Array<{ deckListLimit?: number; favoriteDeckIds?: string[] }> } };
    const doc = raw.cursor?.firstBatch?.[0];
    const limit = typeof doc?.deckListLimit === 'number' ? doc.deckListLimit : DECK_LIST_LIMIT_DEFAULT;
    const favs = Array.isArray(doc?.favoriteDeckIds) ? doc.favoriteDeckIds.filter((x): x is string => typeof x === 'string') : [];
    return { deckListLimit: limit, favoriteDeckIds: favs.slice(0, MAX_FAVORITE_DECKS) };
  } catch {
    return { deckListLimit: DECK_LIST_LIMIT_DEFAULT, favoriteDeckIds: [] };
  }
}

async function writeDeckPrefs(userId: string, set: Prisma.InputJsonObject): Promise<void> {
  await prisma.$runCommandRaw({
    update: 'User',
    updates: [{ q: { _id: { $oid: userId } }, u: { $set: set } }],
  });
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { animationsEnabled: true, soundsEnabled: true, gameBackground: true, allowSpectatorHand: true, hideDeckBuilderVariants: true, manualPowerMode: true, gamepadEnabled: true, countryCode: true, chatVisibility: true, fastAnimations: true, allowNonFriendMessages: true, privateProfile: true, boardPalette: true, siteTheme: true },
    });

    const deckPrefs = await readDeckPrefs(session.user.id);

    return NextResponse.json({
      animationsEnabled: user?.animationsEnabled ?? true,
      soundsEnabled: user?.soundsEnabled ?? true,
      gameBackground: user?.gameBackground || 'default',
      allowSpectatorHand: user?.allowSpectatorHand ?? false,
      hideDeckBuilderVariants: user?.hideDeckBuilderVariants ?? false,
      siteTheme: user?.siteTheme ?? null,
      manualPowerMode: user?.manualPowerMode ?? false,
      gamepadEnabled: user?.gamepadEnabled ?? true,
      countryCode: user?.countryCode ?? null,
      chatVisibility: normalizeChatVisibility(user?.chatVisibility),
      fastAnimations: user?.fastAnimations ?? false,
      allowNonFriendMessages: user?.allowNonFriendMessages ?? true,
      privateProfile: user?.privateProfile ?? false,
      boardPalette: user?.boardPalette ?? null,
      deckListLimit: deckPrefs.deckListLimit,
      favoriteDeckIds: deckPrefs.favoriteDeckIds,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = {};

    if (typeof body.soundsEnabled === 'boolean') {
      update.soundsEnabled = body.soundsEnabled;
    }
    if (typeof body.animationsEnabled === 'boolean') {
      update.animationsEnabled = body.animationsEnabled;
    }
    if (typeof body.gameBackground === 'string' && body.gameBackground.length > 0 && body.gameBackground.length <= 100) {
      update.gameBackground = body.gameBackground;
    }
    if (typeof body.allowSpectatorHand === 'boolean') {
      update.allowSpectatorHand = body.allowSpectatorHand;
    }
    if (body.siteTheme === 'ks' || body.siteTheme === 'ss') {
      update.siteTheme = body.siteTheme;
    }
    if (typeof body.hideDeckBuilderVariants === 'boolean') {
      update.hideDeckBuilderVariants = body.hideDeckBuilderVariants;
    }
    if (typeof body.manualPowerMode === 'boolean') {
      update.manualPowerMode = body.manualPowerMode;
    }
    if (typeof body.gamepadEnabled === 'boolean') {
      update.gamepadEnabled = body.gamepadEnabled;
    }
    if (body.countryCode === null) {
      update.countryCode = null;
    } else if (typeof body.countryCode === 'string' && COUNTRY_CODES.has(body.countryCode)) {
      update.countryCode = body.countryCode;
    }
    if (typeof body.chatVisibility === 'string' && ['everyone', 'friends', 'off'].includes(body.chatVisibility)) {
      update.chatVisibility = body.chatVisibility;
    }
    if (typeof body.fastAnimations === 'boolean') {
      update.fastAnimations = body.fastAnimations;
    }
    if (typeof body.allowNonFriendMessages === 'boolean') {
      update.allowNonFriendMessages = body.allowNonFriendMessages;
    }
    if (typeof body.privateProfile === 'boolean') {
      update.privateProfile = body.privateProfile;
    }
    if (body.boardPalette !== undefined) {
      const check = validateStoredBoardPalette(body.boardPalette);
      if (!check.ok) {
        return NextResponse.json({ error: 'Invalid board palette' }, { status: 400 });
      }
      update.boardPalette = check.value === null ? Prisma.DbNull : check.value;
    }

    const rawSet: Record<string, number | string[]> = {};
    if (body.deckListLimit !== undefined) {
      const n = Number(body.deckListLimit);
      if (!Number.isInteger(n) || n < DECK_LIST_LIMIT_MIN || n > DECK_LIST_LIMIT_MAX) {
        return NextResponse.json({ error: 'Invalid deckListLimit' }, { status: 400 });
      }
      rawSet.deckListLimit = n;
    }
    if (body.favoriteDeckIds !== undefined) {
      if (!Array.isArray(body.favoriteDeckIds)) {
        return NextResponse.json({ error: 'Invalid favoriteDeckIds' }, { status: 400 });
      }
      const seen = new Set<string>();
      const favs: string[] = [];
      for (const raw of body.favoriteDeckIds) {
        if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64) continue;
        if (seen.has(raw)) continue;
        seen.add(raw);
        favs.push(raw);
        if (favs.length >= MAX_FAVORITE_DECKS) break;
      }
      rawSet.favoriteDeckIds = favs;
    }

    if (Object.keys(update).length === 0 && Object.keys(rawSet).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    if (Object.keys(update).length > 0) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: update,
      });
    }
    if (Object.keys(rawSet).length > 0) {
      await writeDeckPrefs(session.user.id, rawSet as Prisma.InputJsonObject);
    }

    if (typeof update.chatVisibility === 'string') {
      refreshChatLock(session.user.id);
    }

    const echo = { ...update, ...rawSet };
    if ('boardPalette' in echo) {
      echo.boardPalette = echo.boardPalette === Prisma.DbNull ? null : echo.boardPalette;
    }

    return NextResponse.json({ success: true, ...echo });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
