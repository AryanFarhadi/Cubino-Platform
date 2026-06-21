import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Apply pending SQL migrations before the server accepts traffic. */
export async function runMigrations(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://cubino:cubino@localhost:5432/cubino";

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  const migrationsFolder = path.join(__dirname, "../../drizzle");

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
