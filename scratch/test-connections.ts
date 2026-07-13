import { PrismaClient } from "../src/generated/prisma/client";

const urls = [
  "postgresql://neondb_owner:npg_qCbyYtnHV52E@ep-autumn-river-ac32vgpp.sa-east-1.aws.neon.tech/neondb?sslmode=require",
  "postgresql://neondb_owner:npg_qCbyYtnHV52E@ep-bitter-pine-acws1t9i-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
];

async function testUrl(url: string) {
  console.log(`Testing URL: ${url}`);
  const client = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    },
    log: ["error"]
  });

  try {
    const start = Date.now();
    await client.$queryRaw`SELECT 1`;
    console.log(`✅ Success! Connected in ${Date.now() - start}ms`);
    return true;
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
    return false;
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  for (const url of urls) {
    const success = await testUrl(url);
    if (success) {
      console.log(`🎉 Found working URL: ${url}`);
    }
  }
}

main().catch(console.error);
