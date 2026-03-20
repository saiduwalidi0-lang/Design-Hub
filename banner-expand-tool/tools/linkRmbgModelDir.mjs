import { promises as fs } from "node:fs";
import path from "node:path";

const sourceDir = "D:\\comfyui\\models\\RMBG\\RMBG-2.0";
const destDir =
  "D:\\comfyui\\comfyui-new\\ComfyUI_windows_portable_nvidia\\ComfyUI_windows_portable\\ComfyUI\\models\\RMBG\\RMBG-2.0";

async function exists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(sourceDir))) {
    throw new Error(`Source not found: ${sourceDir}`);
  }

  if (await exists(destDir)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = `${destDir}.bak.${ts}`;
    await fs.rename(destDir, backupDir);
  }

  await fs.mkdir(path.dirname(destDir), { recursive: true });
  await fs.symlink(sourceDir, destDir, "junction");
  process.stdout.write(`Linked ${destDir} -> ${sourceDir}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

