import { Prisma, type PrismaClient } from "@prisma/client";
import { currentActor } from "./auth";

type Writer = Prisma.TransactionClient | PrismaClient;

export function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, inner: unknown) => {
      if (
        typeof inner === "object" &&
        inner !== null &&
        !(inner instanceof Date) &&
        "toFixed" in inner &&
        typeof inner.toFixed === "function"
      ) {
        return String(inner);
      }
      return inner;
    }),
  ) as Prisma.InputJsonValue;
}

export async function writeAudit(
  db: Writer,
  entry: {
    entityType: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE";
    summary: string;
    previousValue?: unknown;
    newValue?: unknown;
  },
) {
  await db.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actor: currentActor,
      summary: entry.summary,
      previousValue:
        entry.previousValue === undefined ? undefined : jsonSafe(entry.previousValue),
      newValue: entry.newValue === undefined ? undefined : jsonSafe(entry.newValue),
    },
  });
}
