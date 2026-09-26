"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, invalid, str, type ActionState } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextCode } from "@/lib/persist";
import { partySchema } from "@/lib/validation";

function partyPath(id: string, asOf: string, notice: string) {
  const params = new URLSearchParams({ notice });
  if (asOf) params.set("asOf", asOf);
  return `/parties/${id}?${params.toString()}`;
}

export async function createParty(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = partySchema.safeParse({
    name: str(formData, "name"),
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const asOf = str(formData, "asOf");
  let id = "";
  try {
    id = await prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, "party");
      const party = await tx.party.create({ data: { code, ...parsed.data } });
      await writeAudit(tx, {
        entityType: "Party",
        entityId: party.id,
        action: "CREATE",
        summary: `Added party ${party.name} (${party.code}).`,
        newValue: { name: party.name, phone: party.phone, code: party.code },
      });
      return party.id;
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not save the party. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect(partyPath(id, asOf, "Party saved."));
}

export async function updateParty(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = str(formData, "id");
  const parsed = partySchema.safeParse({
    name: str(formData, "name"),
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  const asOf = str(formData, "asOf");
  try {
    const existing = await prisma.party.findUnique({ where: { id } });
    if (!existing) return invalid("That party could not be found.");
    await prisma.$transaction(async (tx) => {
      const party = await tx.party.update({ where: { id }, data: parsed.data });
      await writeAudit(tx, {
        entityType: "Party",
        entityId: id,
        action: "UPDATE",
        summary: `Updated party ${party.name} (${party.code}).`,
        previousValue: {
          name: existing.name,
          phone: existing.phone,
          address: existing.address,
          notes: existing.notes,
        },
        newValue: parsed.data,
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not update the party. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect(partyPath(id, asOf, "Party updated."));
}

export async function archiveParty(formData: FormData) {
  const id = str(formData, "id");
  const party = await prisma.party.findUnique({ where: { id } });
  if (!party) redirect("/parties?notice=That party could not be found.");
  await prisma.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: { isActive: false } });
    await writeAudit(tx, {
      entityType: "Party",
      entityId: id,
      action: "DELETE",
      summary: `Archived ${party.name}. Financial records were kept.`,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });
  });
  revalidatePath("/", "layout");
  redirect("/parties?notice=Party archived. The ledger was kept.");
}

export async function restoreParty(formData: FormData) {
  const id = str(formData, "id");
  const party = await prisma.party.findUnique({ where: { id } });
  if (!party) redirect("/parties?notice=That party could not be found.");
  await prisma.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: { isActive: true } });
    await writeAudit(tx, {
      entityType: "Party",
      entityId: id,
      action: "RESTORE",
      summary: `Restored ${party.name}.`,
      previousValue: { isActive: false },
      newValue: { isActive: true },
    });
  });
  revalidatePath("/", "layout");
  redirect(`/parties/${id}?notice=${encodeURIComponent("Party restored.")}`);
}

export async function deleteParty(formData: FormData) {
  const id = str(formData, "id");
  const party = await prisma.party.findUnique({
    where: { id },
    include: { _count: { select: { loans: true } } },
  });
  if (!party) redirect("/parties?notice=That party could not be found.");
  if (party._count.loans > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.party.update({ where: { id }, data: { isActive: false } });
      await writeAudit(tx, {
        entityType: "Party",
        entityId: id,
        action: "DELETE",
        summary: `Archived ${party.name} instead of deleting it, because loans exist.`,
        previousValue: { isActive: party.isActive },
        newValue: { isActive: false },
      });
    });
    revalidatePath("/", "layout");
    redirect(
      `/parties/${id}?notice=${encodeURIComponent("This party has loans, so it was archived instead of deleted.")}`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      entityType: "Party",
      entityId: id,
      action: "DELETE",
      summary: `Deleted ${party.name} (${party.code}). There were no loans.`,
      previousValue: { name: party.name, code: party.code },
    });
    await tx.party.delete({ where: { id } });
  });
  revalidatePath("/", "layout");
  redirect("/parties?notice=Party deleted.");
}
