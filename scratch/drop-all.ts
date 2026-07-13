import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
      }
    }
  });

  try {
    await client.$connect();
    console.log("Connected to database. Dropping schema public...");
    await client.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE;");
    await client.$executeRawUnsafe("CREATE SCHEMA public;");
    console.log("Schema public dropped and recreated successfully!");
    await client.$disconnect();
  } catch (err: any) {
    console.error("Drop schema failed:", err);
  }
}

main();
