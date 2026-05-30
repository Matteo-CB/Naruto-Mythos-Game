import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/db/prisma';
import { getIO } from './io';

function tradeChannel(roomId: string): string {
  return `trade:${roomId}`;
}

export function emitTradeUpdate(roomId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(tradeChannel(roomId)).emit(event, data);
}

export function registerTradeHandlers(_io: Server, socket: Socket) {
  socket.on('trade:subscribe', async ({ roomId }: { roomId: string }) => {
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId || typeof roomId !== 'string') return;
    const room = await prisma.tradeRoom.findUnique({
      where: { id: roomId },
      select: { creatorId: true, guestId: true },
    });
    if (!room) return;
    if (room.creatorId !== userId && room.guestId !== userId) return;
    socket.join(tradeChannel(roomId));
  });

  socket.on('trade:unsubscribe', ({ roomId }: { roomId: string }) => {
    if (typeof roomId === 'string') socket.leave(tradeChannel(roomId));
  });
}
