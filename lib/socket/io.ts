import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setIO(server: SocketIOServer) {
  ioInstance = server;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

// User-to-socket mapping for targeted event delivery
const userSockets = new Map<string, Set<string>>();

export function registerUserSocket(userId: string, socketId: string) {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(userId, sockets);
  }
  sockets.add(socketId);
}

export function unregisterUserSocket(userId: string, socketId: string) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  }
}

export function removeSocketFromAll(socketId: string): string | null {
  for (const [userId, sockets] of userSockets) {
    if (sockets.has(socketId)) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
      return userId;
    }
  }
  return null;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  const io = ioInstance;
  if (!io) return;
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
}
