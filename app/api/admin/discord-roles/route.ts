import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { ELO_ROLES, getAllEloRoleNames } from '@/lib/discord/roles';

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

    // Find old roles to delete
    const oldRoleNames = ['Genin', 'Chunin', 'Kage'];
    const eloRoleNames = getAllEloRoleNames();
    const rolesToDelete = existingRoles.filter(
      (r) => oldRoleNames.includes(r.name) || eloRoleNames.includes(r.name),
    );

    const oldRoleIds = rolesToDelete.map((r) => r.id);

    // Collect template overwrites from old roles for permission migration
    const channelsRes = await discordFetch(`/guilds/${GUILD_ID}/channels`);
    const channels = channelsRes.ok
      ? (await channelsRes.json() as Array<{
          id: string;
          name: string;
          permission_overwrites?: Array<{ id: string; allow: string; deny: string }>;
        }>)
      : [];

    // Create new ELO roles
    const createdRoles: Array<{ name: string; id: string }> = [];
    for (const roleDef of ELO_ROLES) {
      const res = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: roleDef.name,
          color: roleDef.color,
          hoist: true,
          mentionable: false,
          permissions: '0',
        }),
      });

      if (res.ok) {
        const role = await res.json() as { id: string };
        createdRoles.push({ name: roleDef.name, id: role.id });
      }
    }

    // Migrate channel permissions
    let migratedChannels = 0;
    for (const channel of channels) {
      const overwrites = channel.permission_overwrites || [];
      const hasOldOverwrite = overwrites.some((ow) => oldRoleIds.includes(ow.id));
      if (!hasOldOverwrite) continue;

      // Find template overwrite
      let template: { allow: string; deny: string } | null = null;
      for (const ow of overwrites) {
        if (oldRoleIds.includes(ow.id)) {
          if (!template || BigInt(ow.allow) > BigInt(template.allow)) {
            template = { allow: ow.allow, deny: ow.deny };
          }
        }
      }

      if (!template) continue;

      for (const newRole of createdRoles) {
        const exists = overwrites.some((ow) => ow.id === newRole.id);
        if (exists) continue;

        await discordFetch(`/channels/${channel.id}/permissions/${newRole.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            id: newRole.id,
            type: 0,
            allow: template.allow,
            deny: template.deny,
          }),
        });
      }

      migratedChannels++;
    }

    // Delete old roles
    let deletedCount = 0;
    for (const role of rolesToDelete) {
      const res = await discordFetch(`/guilds/${GUILD_ID}/roles/${role.id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204 || res.status === 404) {
        deletedCount++;
      }
    }

    return NextResponse.json({
      created: createdRoles.length,
      deleted: deletedCount,
      migratedChannels,
      roles: createdRoles.map((r) => r.name),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 500 },
    );
  }
}
