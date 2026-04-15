import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const version = process.env.APP_VERSION?.trim() || new Date().toISOString();

const publicDir = path.join(rootDir, "public");
const generatedDir = path.join(rootDir, "src", "generated");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, "version.txt"), `${version}\n`, "utf8");
fs.writeFileSync(
  path.join(generatedDir, "appVersion.ts"),
  `export const APP_VERSION = ${JSON.stringify(version)};\n`,
  "utf8"
);

process.stdout.write(`App version sincronizada: ${version}\n`);