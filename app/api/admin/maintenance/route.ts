import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { getIO } from '@/lib/socket/io';
import { isMaintenanceActive, getMaintenanceState } from '@/lib/socket/maintenance';
import { startMaintenanceDrain, getActiveGameCount } from '@/lib/socket/server';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

export async function GET() {
  const state = getMaintenanceState();

  // Admin users get full details
  const session = await auth();
  if (session?.user?.name && ADMIN_USERNAMES.includes(session.user.name)) {
    return NextResponse.json({
      active: state.active,
      activeGames: getActiveGameCount(),
      startedAt: state.startedAt,
    });
  }

  // Public: only expose active status
  return NextResponse.json({ active: state.active });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isMaintenanceActive()) {
    return NextResponse.json({ error: 'Maintenance already active' }, { status: 409 });
  }

  const io = getIO();
  if (!io) {
    return NextResponse.json({ error: 'Socket.io not initialized' }, { status: 500 });
  }

  startMaintenanceDrain(io);

  return NextResponse.json({
    active: true,
    activeGames: getActiveGameCount(),
    startedAt: Date.now(),
  });
}
