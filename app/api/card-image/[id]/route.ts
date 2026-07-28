import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { getServerCardById } from '@/lib/data/serverCards';
import { isCardPublic } from '@/lib/cards/reveal';
import { ensureSetConfigLoaded } from '@/lib/data/setConfigServer';
import { holoBaseId } from '@/lib/holo/holoId';

export const dynamic = 'force-dynamic';

const PRIVATE_ROOT = path.join(process.cwd(), 'lib', 'data', 'private-cards');
const PUBLIC_ROOT = path.join(process.cwd(), 'public', 'images', 'cards');

// Serves revealing-set card images that live outside public/. A revealed (public) card image
// is served to anyone; an unrevealed one is served only to admins and testers. Regular players
// can never fetch an unrevealed image: it is not in public/, has no guessable static URL, and
// this route refuses it without privilege.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSetConfigLoaded();
  const { id } = await ctx.params;
  const baseId = holoBaseId(id);
  const card = getServerCardById(baseId);
  if (!card || !card.image_file) {
    return new NextResponse(null, { status: 404 });
  }

  const isPublic = await isCardPublic(baseId);
  if (!isPublic) {
    const session = await auth().catch(() => null);
    let privileged = false;
    if (session?.user?.id) {
      if (isAdmin({ username: session.user.name, email: session.user.email })) {
        privileged = true;
      } else {
        const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
        privileged = dbUser?.role === 'tester';
      }
    }
    if (!privileged) return new NextResponse(null, { status: 404 });
  }

  const rel = card.image_file.replace(/^\/?images\/cards\//, '');
  const filePath = path.join(PRIVATE_ROOT, rel);
  if (!filePath.startsWith(PRIVATE_ROOT)) return new NextResponse(null, { status: 404 });
  const publicPath = path.join(PUBLIC_ROOT, rel);
  if (!publicPath.startsWith(PUBLIC_ROOT)) return new NextResponse(null, { status: 404 });

  try {
    const buf = await readFile(filePath).catch(() => readFile(publicPath));
    const body = new Uint8Array(buf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': isPublic ? 'public, max-age=300' : 'private, no-store',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
