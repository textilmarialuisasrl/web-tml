// Audit script for user emails
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.usuario.findMany({ select: { id: true, email: true } });
  const normalized = users.map(u => ({ ...u, normEmail: u.email.trim().toLowerCase() }));
  // Map normalized email to ids
  const map = new Map<string, string[]>();
  for (const u of normalized) {
    const key = u.normEmail;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(u.id);
  }
  const duplicates = Array.from(map.entries()).filter(([, ids]) => ids.length > 1);
  console.log("--- USER AUDIT REPORT ---");
  console.log("Total users:", users.length);
  console.log("Duplicates after normalization:", duplicates);
  console.log(
    "Emails with uppercase:",
    users.filter(u => /[A-Z]/.test(u.email)).map(u => ({ id: u.id, email: u.email }))
  );
  console.log(
    "Emails with leading/trailing spaces:",
    users.filter(u => /^\s|\s$/.test(u.email)).map(u => ({ id: u.id, email: u.email }))
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
