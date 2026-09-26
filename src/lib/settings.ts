import { prisma } from "./db";

export async function getSettings() {
  return prisma.appSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}
