import { prisma } from "../src/backend/db/prisma";

async function main() {
  console.log("Testing Prisma Query...");
  try {
    const res = await prisma.movimiento.findFirst({
      where: {
        clientGeneratedId: "test-id-123",
      },
    });
    console.log("Success! Query result:", res);
  } catch (err: any) {
    console.error("Error running query:", err);
  }
}

main();
