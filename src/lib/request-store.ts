import { seedDemoIfNeeded } from "./demo";
import { hydrateStore } from "./store";

export async function prepareRequestStore() {
  await hydrateStore();
  seedDemoIfNeeded();
}
