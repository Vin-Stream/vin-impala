import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Heroku config vars win. Local service settings win over the repo-root file.
if (process.env.NODE_ENV !== "production") {
  for (const relative of [".env", "../../.env"]) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    if (existsSync(path)) config({ path, quiet: true });
  }
}
