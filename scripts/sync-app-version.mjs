import fs from "node:fs";
import path from "node:path";

// The visible version is the one committed in src/generated/appVersion.ts (bump it by hand per release).
// The build only mirrors it to public/version.txt so the published site and the bundle always agree.
const rootDir = process.cwd();
const versionFile = path.join(rootDir, "src", "generated", "appVersion.ts");
const publicDir = path.join(rootDir, "public");

let version = "v0.0.0";
try {
  const match = fs.readFileSync(versionFile, "utf8").match(/v\d+\.\d+\.\d+/);
  if (match) version = match[0];
} catch {}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, "version.txt"), `${version}\n`, "utf8");
process.stdout.write(`App version: ${version}\n`);
