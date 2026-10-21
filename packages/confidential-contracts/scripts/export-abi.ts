/**
 * Writes abi/GhostPayConfidentialRouter.json and abi/GhostPayTestConfidentialToken.json from the
 * compiled artifacts. Run after `hardhat compile`: `npx hardhat run scripts/export-abi.ts`.
 */
import { artifacts } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const dir = join(__dirname, "..", "abi");
  mkdirSync(dir, { recursive: true });
  for (const name of ["GhostPayConfidentialRouter", "GhostPayTestConfidentialToken", "MockERC20"]) {
    const a = await artifacts.readArtifact(name);
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ contractName: name, abi: a.abi }, null, 2) + "\n");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
