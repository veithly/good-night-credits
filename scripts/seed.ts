// Reset the file-backed store and re-seed the sample user.
// Usage: npm run seed

import { resetDB } from "../src/lib/store";
import { seedDemoIfNeeded } from "../src/lib/demo";

async function main() {
  resetDB();
  const user = seedDemoIfNeeded();
  console.log(`✔ seeded sample user (${user.id}). Run \`npm run dev\` and open /app.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
