import { prisma } from "../src/backend/db/prisma";

async function main() {
  console.log("=== CONFIGURATIONS ===");
  const configs = await prisma.configuracion.findMany();
  console.log(configs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
