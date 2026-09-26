"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, invalid, str, type ActionState } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export async function updateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = settingsSchema.safeParse({
    businessName: str(formData, "businessName"),
    address: str(formData, "address"),
    phone: str(formData, "phone"),
    dayCountBasis: str(formData, "dayCountBasis"),
    currency: str(formData, "currency"),
    currencySymbol: str(formData, "currencySymbol"),
    dateFormat: str(formData, "dateFormat"),
    timezone: str(formData, "timezone"),
  });
  if (!parsed.success) {
    return invalid("Please correct the highlighted fields.", fieldErrorsFrom(parsed.error));
  }
  try {
    const previous = await getSettings();
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.update({
        where: { id: "default" },
        data: parsed.data,
      });
      await writeAudit(tx, {
        entityType: "AppSetting",
        entityId: "default",
        action: "UPDATE",
        summary: "Updated business settings.",
        previousValue: {
          businessName: previous.businessName,
          dayCountBasis: previous.dayCountBasis,
          currency: previous.currency,
          timezone: previous.timezone,
        },
        newValue: parsed.data,
      });
    });
  } catch (error) {
    console.error(error);
    return invalid("Could not save settings. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect("/settings?notice=Settings saved.");
}
