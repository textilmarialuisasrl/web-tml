import { prisma } from "../src/backend/db/prisma";

async function main() {
  const [productos, depositos, talleres] = await Promise.all([
    prisma.producto.findMany(),
    prisma.deposito.findMany(),
    prisma.taller.findMany()
  ]);

  console.log(`📊 Database Status:`);
  console.log(`- Productos: ${productos.length}`);
  console.log(`- Depósitos: ${depositos.length}`);
  console.log(`- Talleres: ${talleres.length}`);

  console.log("\n📦 Productos:");
  productos.forEach((p, i) => console.log(`${i+1}. ${p.nombre} (id: ${p.id}, cat: ${p.categoria}, fardo: ${p.unidadesPorFardo})`));

  console.log("\n🏪 Depósitos:");
  depositos.forEach((d, i) => console.log(`${i+1}. ${d.nombre} (id: ${d.id}, tipo: ${d.tipo})`));

  console.log("\n🧵 Talleres:");
  talleres.forEach((t, i) => console.log(`${i+1}. ${t.nombre} (id: ${t.id})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
