import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { log, errInfo } from "@/server/log";

export interface AuditActor { id: string; email: string }

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Record who did what. Pass the transaction client (`tx`) when the change itself happens in a
 * transaction, so the change and its audit row are saved (or rolled back) together.
 */
export async function audit(
  entry: { actor?: AuditActor | null; action: string; entity: string; entityId?: string | null; detail?: unknown; ip?: string | null },
  db: Tx = prisma,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        detail: entry.detail === undefined ? null : JSON.stringify(entry.detail).slice(0, 4000),
        ip: entry.ip ?? null,
      },
    });
  } catch (e) {
    // Inside a transaction we must not swallow the error (the caller decides); outside, log it.
    if (db !== prisma) throw e;
    log.error("audit_write_failed", { action: entry.action, ...errInfo(e) });
  }
}
