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
    const tables: any[] = await client.$queryRaw`
      SELECT table_name, table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("Tables in database:", tables);
    await client.$disconnect();
  } catch (err: any) {
    console.error("Connection failed:", err);
  }
}

main();
