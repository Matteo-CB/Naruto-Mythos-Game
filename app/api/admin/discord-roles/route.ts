import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { ALL_ELO_ROLES } from '@/lib/discord/roles';
import { prisma } from '@/lib/db/prisma';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];
const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

async function discordFetch(path: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  // Handle rate limiting
  if (res.status === 429) {
    const data = await res.json() as { retry_after?: number };
    const retryAfter = (data.retry_after || 1) * 1000;
    await new Promise((r) => setTimeout(r, retryAfter));
    return discordFetch(path, options);
  }

  return res;
}

/**
 * GET — Fetch current Discord role ID mapping from the database.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });

    const roleIdMap = (settings?.discordRoleIds as Record<string, string> | null) ?? {};

    // Also fetch guild roles to show what exists on Discord
    let guildRoles: Array<{ id: string; name: string }> = [];
    if (BOT_TOKEN && GUILD_ID) {
      const res = await discordFetch(`/guilds/${GUILD_ID}/roles`);
      if (res.ok) {
        guildRoles = await res.json() as Array<{ id: string; name: string }>;
      }
    }

    return NextResponse.json({
      storedMapping: roleIdMap,
      allRoleKeys: ALL_ELO_ROLES.map((r) => ({ key: r.key, label: r.label })),
      guildRoles: guildRoles.map((r) => ({ id: r.id, name: r.name })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

/**
 * POST — Create ELO roles on Discord and store their IDs in SiteSettings.
 * If roles already exist (matched by label), reuses them.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!BOT_TOKEN || !GUILD_ID) {
      return NextResponse.json(
        { error: 'BOT_DISCORD_TOKEN or SERVER_DISCORD_ID not configured' },
        { status: 500 },
      );
    }

    // Fetch existing guild roles
    const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
    if (!rolesRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch guild roles: ${rolesRes.status}` },
        { status: 500 },
      );
    }
    const existingRoles = await rolesRes.json() as Array<{ id: string; name: string }>;

    // Build mapping: try to find existing roles by label, create if missing
    const roleIdMap: Record<string, string> = {};
    const created: string[] = [];
    const reused: string[] = [];

    for (const roleDef of ALL_ELO_ROLES) {
      // Try to find an existing role matching the label
      const existing = existingRoles.find((r) => r.name === roleDef.label);
      if (existing) {
        roleIdMap[roleDef.key] = existing.id;
        reused.push(roleDef.label);
        continue;
      }

      // Create the role
      const res = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: roleDef.label,
          color: roleDef.color,
          hoist: roleDef.hoist,
          mentionable: false,
          permissions: '0',
        }),
      });

      if (res.ok) {
        const role = await res.json() as { id: string };
        roleIdMap[roleDef.key] = role.id;
        created.push(roleDef.label);
      } else {
        console.error(`[Discord] Failed to create role "${roleDef.label}": ${res.status}`);
      }
    }

    // Store the mapping in SiteSettings
    await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: { discordRoleIds: roleIdMap },
      create: { key: 'global', discordRoleIds: roleIdMap },
    });

    return NextResponse.json({
      roleIdMap,
      created,
      reused,
      total: Object.keys(roleIdMap).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

/**
 * PUT — Manually set Discord role ID mapping without creating roles.
 * Body: { roleIdMap: { "unranked": "id", "genin": "id", ... } }
 */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as { roleIdMap?: Record<string, string> };
    if (!body.roleIdMap || typeof body.roleIdMap !== 'object') {
      return NextResponse.json({ error: 'Missing roleIdMap object in body' }, { status: 400 });
    }

    // Validate keys
    const validKeys = new Set(ALL_ELO_ROLES.map((r) => r.key));
    const invalidKeys = Object.keys(body.roleIdMap).filter((k) => !validKeys.has(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json({ error: `Invalid role keys: ${invalidKeys.join(', ')}` }, { status: 400 });
    }

    await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: { discordRoleIds: body.roleIdMap },
      create: { key: 'global', discordRoleIds: body.roleIdMap },
    });

    return NextResponse.json({ success: true, roleIdMap: body.roleIdMap });
  } catch (error) {
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}
