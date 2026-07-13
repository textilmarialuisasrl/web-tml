import { AuthService } from "../src/backend/services/auth.service";

const credentials = [
  { name: "Ariel", email: "arielroskopf@gmail.com", password: "Textil2026!" },
  { name: "Leo", email: "leonelroskopf1234@gmail.com", password: "Textil2026!" },
  { name: "Nacho", email: "roskopfignacio5@gmail.com", password: "Textil2026!" },
  { name: "Rolando", email: "roskopflachi@gmail.com", password: "Textil2026!" }
];

async function main() {
  console.log("Starting authentication verification for pilot users...");
  let successCount = 0;

  for (const cred of credentials) {
    try {
      console.log(`\nAttempting login for ${cred.name} (${cred.email})...`);
      const result = await AuthService.login(cred.email, cred.password);
      console.log(`✅ Success! Authenticated as ${result.user.nombre}`);
      console.log(`   Permisos: ${JSON.stringify(result.user.permisos)}`);
      successCount++;
    } catch (err: any) {
      console.error(`❌ Failed to authenticate ${cred.name}: ${err.message || err}`);
    }
  }

  console.log(`\nVerification finished. Successful logins: ${successCount}/${credentials.length}`);
}

main().catch(console.error);
