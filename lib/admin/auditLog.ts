import { prisma } from '@/lib/db/prisma';

interface AuditLogInput {
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string;
  payload?: unknown;
}

interface AuditLogCapable {
  adminAction?: {
    create: (args: { data: AuditLogInput & { payload?: unknown } }) => Promise<unknown>;
  };
}

export async function logAdminAction(input: AuditLogInput): Promise<void> {
  const client = prisma as unknown as AuditLogCapable;
  if (!client.adminAction?.create) return;
  try {
    await client.adminAction.create({
      data: {
        actorId: input.actorId,
        actorName: input.actorName,
        action: input.action,
        targetId: input.targetId,
        payload: input.payload as object | undefined,
      },
    });
  } catch (e) {
    console.error('[adminAuditLog] failed:', e instanceof Error ? e.message : e);
  }
}
