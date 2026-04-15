import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const versionFile = path.join(rootDir, "src", "generated", "appVersion.ts");
const publicDir = path.join(rootDir, "public");
const generatedDir = path.join(rootDir, "src", "generated");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

// Read current version and bump patch
let major = 1, minor = 8, patch = 1;
try {
  const current = fs.readFileSync(versionFile, "utf8");
  const match = current.match(/v(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    patch = parseInt(match[3], 10) + 1;
  }
} catch {}

const version = `v${major}.${minor}.${patch}`;

fs.writeFileSync(path.join(publicDir, "version.txt"), `${version}\n`, "utf8");
fs.writeFileSync(
  versionFile,
  `export const APP_VERSION = ${JSON.stringify(version)};\n`,
  "utf8"
);

process.stdout.write(`App version sincronizada: ${version}\n`);