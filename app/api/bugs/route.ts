import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

// POST — submit a bug report (any authenticated user)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const description = formData.get('description') as string;
    const imageFile = formData.get('image') as File | null;

    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    let imageData: string | null = null;
    if (imageFile && imageFile.size > 0) {
      // Limit to 5MB
      if (imageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 });
      }
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = imageFile.type || 'image/png';
      imageData = `data:${mimeType};base64,${base64}`;
    }

    const report = await prisma.bugReport.create({
      data: {
        userId: session.user.id,
        username: session.user.name || 'Unknown',
        description: description.trim(),
        imageData,
        status: 'open',
      },
    });

    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — list all bug reports (admin only)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reports = await prisma.bugReport.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reports });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
