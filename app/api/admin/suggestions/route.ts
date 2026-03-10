import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const SUGGESTION_USERS = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

function isAuthorized(name: string | null | undefined): boolean {
  return !!name && SUGGESTION_USERS.includes(name);
}

// GET - list all suggestions (with optional filters)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const id = searchParams.get('id');

    // Single suggestion fetch
    if (id) {
      const suggestion = await prisma.suggestion.findUnique({ where: { id } });
      if (!suggestion) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ suggestion });
    }

    const where: Record<string, string> = {};
    if (status && status !== 'all') where.status = status;
    if (category && category !== 'all') where.category = category;

    const suggestions = await prisma.suggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - create a new suggestion (supports images + audio as base64)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, category, priority, images, audioUrl } = body;

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const validCategories = ['gameplay', 'ui', 'cards', 'balance', 'social', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Validate images size (each max 2MB base64)
    if (images && Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === 'string' && img.length > 2.8 * 1024 * 1024) {
          return NextResponse.json({ error: 'Image too large (max 2MB each)' }, { status: 400 });
        }
      }
      if (images.length > 5) {
        return NextResponse.json({ error: 'Max 5 images per suggestion' }, { status: 400 });
      }
    }

    // Validate audio size (max 5MB base64)
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too large (max 5MB)' }, { status: 400 });
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        category: category || 'other',
        priority: priority || 'normal',
        status: 'backlog',
        images: images || [],
        audioUrl: audioUrl || null,
        submittedBy: session!.user!.name!,
      },
    });

    return NextResponse.json({ suggestion });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - update suggestion (status, description, notes, priority, assignee, images, audio)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, title, description, category, priority, adminNotes, assignedTo, images, audioUrl, addImage, removeImageIndex } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing suggestion id' }, { status: 400 });
    }

    // Add a single image to existing suggestion
    if (addImage && typeof addImage === 'string') {
      if (addImage.length > 2.8 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image too large (max 2MB)' }, { status: 400 });
      }
      const existing = await prisma.suggestion.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (existing.images.length >= 5) {
        return NextResponse.json({ error: 'Max 5 images per suggestion' }, { status: 400 });
      }
      const suggestion = await prisma.suggestion.update({
        where: { id },
        data: { images: { push: addImage }, updatedBy: session!.user!.name! },
      });
      return NextResponse.json({ suggestion });
    }

    // Remove image by index
    if (removeImageIndex !== undefined && typeof removeImageIndex === 'number') {
      const existing = await prisma.suggestion.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const newImages = existing.images.filter((_, i) => i !== removeImageIndex);
      const suggestion = await prisma.suggestion.update({
        where: { id },
        data: { images: newImages, updatedBy: session!.user!.name! },
      });
      return NextResponse.json({ suggestion });
    }

    // Standard field updates
    const updateData: Record<string, unknown> = { updatedBy: session!.user!.name! };
    if (status !== undefined) updateData.status = status;
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (priority !== undefined) updateData.priority = priority;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null;
    if (images !== undefined) updateData.images = images;
    if (audioUrl !== undefined) updateData.audioUrl = audioUrl || null;

    const suggestion = await prisma.suggestion.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ suggestion });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - remove a suggestion
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!isAuthorized(session?.user?.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing suggestion id' }, { status: 400 });
    }

    await prisma.suggestion.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
