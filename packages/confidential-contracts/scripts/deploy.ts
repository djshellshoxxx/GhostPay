/**
 * Testnet-only deploy script for the CT-1 proof of concept.
 *
 *   local:   npx hardhat run scripts/deploy.ts                 (in-process mock, chain 31337)
 *   sepolia: SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=... FEE_RECIPIENT=0x... ANNOUNCER=0x... \
 *            npx hardhat run scripts/deploy.ts --network sepolia
 *
 * Refuses every chain id except 31337 and 11155111 (CT-C-8). Nothing here has been run against
 * Sepolia. No address or key is stored in the repository; the deploy output is printed only.
 */
import { ethers, network } from "hardhat";

const ALLOWED = new Set([31337n, 11155111n]);

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (!ALLOWED.has(chainId)) throw new Error(`refusing to deploy on chain ${chainId}: testnet PoC only (31337, 11155111)`);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("no deployer account configured");

  const feeRecipient = process.env.FEE_RECIPIENT ?? (chainId === 31337n ? (await ethers.getSigners())[1]!.address : "");
  if (!ethers.isAddress(feeRecipient)) throw new Error("set FEE_RECIPIENT to a throw-away test address");

  let announcer = process.env.ANNOUNCER ?? "";
  if (!announcer) {
    if (chainId !== 31337n) throw new Error("set ANNOUNCER to the ERC-5564 announcer address on this chain");
    announcer = await (await (await ethers.getContractFactory("MockAnnouncer")).deploy()).getAddress();
  }
  if (!ethers.isAddress(announcer)) throw new Error("ANNOUNCER is not an address");

  const underlying = await (await ethers.getContractFactory("MockERC20")).deploy();
  const token = await (await ethers.getContractFactory("GhostPayTestConfidentialToken")).deploy(await underlying.getAddress());
  const router = await (await ethers.getContractFactory("GhostPayConfidentialRouter")).deploy(announcer, feeRecipient, [await token.getAddress()]);
  await router.waitForDeployment();

  console.log(
    JSON.stringify(
      {
        network: network.name,
        chainId: chainId.toString(),
        deployer: deployer.address,
        announcer,
        feeRecipient,
        underlying: await underlying.getAddress(),
        token: await token.getAddress(),
        router: await router.getAddress(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
