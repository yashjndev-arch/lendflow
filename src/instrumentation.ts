export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;
  try {
    const { ensureDemoSeed } = await import("@/lib/demo-seed");
    await ensureDemoSeed();
  } catch (error) {
    console.error("Demo seed skipped.", error);
  }
}
