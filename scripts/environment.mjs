import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error("Cutroom could not read the local .env configuration.");
}
