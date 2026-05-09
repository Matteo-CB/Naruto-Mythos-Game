import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function isAdmin() {
  const session = await auth();
  return session?.user?.email === ADMIN_EMAIL || ADMIN_USERNAMES.includes(session?.user?.name ?? '');
}


export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const backgrounds = await prisma.gameBackground.findMany({
    orderBy: { sortOrder: 'asc' },
    take: 50,
  });

  return NextResponse.json({ backgrounds });
}


export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string)?.trim();

    if (!file || !name) {
      return NextResponse.json({ error: 'Missing file or name' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 chars)' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'File type not allowed (jpeg/png/webp/gif only)' }, { status: 400 });
    }

    
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    
    const last = await prisma.gameBackground.findFirst({ orderBy: { sortOrder: 'desc' } });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    const bg = await prisma.gameBackground.create({
      data: {
        name,
        url: dataUrl,
        sortOrder,
      },
    });

    return NextResponse.json({ background: { id: bg.id, name: bg.name, url: bg.url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A background with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}


export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.gameBackground.delete({ where: { id } });

    
    await prisma.$runCommandRaw({
      update: 'User',
      updates: [
        {
          q: { gameBackground: id },
          u: { $set: { gameBackground: 'default' } },
          multi: true,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
