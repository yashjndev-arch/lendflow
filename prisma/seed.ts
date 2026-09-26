import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/lib/demo-seed";

seedDemo()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
