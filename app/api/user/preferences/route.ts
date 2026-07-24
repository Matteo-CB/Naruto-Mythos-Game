import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { COUNTRY_CODES } from '@/lib/data/countries';
import { refreshChatLock } from '@/lib/socket/chatLockBridge';
import { normalizeChatVisibility } from '@/lib/chat/chatRules';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { animationsEnabled: true, soundsEnabled: true, gameBackground: true, allowSpectatorHand: true, hideDeckBuilderVariants: true, manualPowerMode: true, gamepadEnabled: true, countryCode: true, chatVisibility: true, fastAnimations: true, allowNonFriendMessages: true, privateProfile: true },
    });

    return NextResponse.json({
      animationsEnabled: user?.animationsEnabled ?? true,
      soundsEnabled: user?.soundsEnabled ?? true,
      gameBackground: user?.gameBackground || 'default',
      allowSpectatorHand: user?.allowSpectatorHand ?? false,
      hideDeckBuilderVariants: user?.hideDeckBuilderVariants ?? false,
      manualPowerMode: user?.manualPowerMode ?? false,
      gamepadEnabled: user?.gamepadEnabled ?? true,
      countryCode: user?.countryCode ?? null,
      chatVisibility: normalizeChatVisibility(user?.chatVisibility),
      fastAnimations: user?.fastAnimations ?? false,
      allowNonFriendMessages: user?.allowNonFriendMessages ?? true,
      privateProfile: user?.privateProfile ?? false,
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

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: update,
    });

    if (typeof update.chatVisibility === 'string') {
      refreshChatLock(session.user.id);
    }

    return NextResponse.json({ success: true, ...update });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
