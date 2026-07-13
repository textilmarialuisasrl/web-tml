import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import "dotenv/config";

async function main() {
    const passwordHash = await bcrypt.hash("admin123", 10);

    const user = await prisma.usuario.create({
        data: {
            nombre: "Administrador",
            email: "admin@tml.com",
            passwordHash,
        },
    });

    console.log(user);
}

main();