import { prisma } from "../src/backend/db/prisma";

console.log("Prisma keys:", Object.keys(prisma).filter(k => !k.startsWith("_")));
