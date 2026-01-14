import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { getFilteredData } from "./fetchTftData.ts";

const client = new ConvexHttpClient(""
);

export async function seed() {
  const data = await getFilteredData();

  await client.mutation(api.mutations.seed.insertAll, data);
  console.log("✅ Seed completed");
}
seed();