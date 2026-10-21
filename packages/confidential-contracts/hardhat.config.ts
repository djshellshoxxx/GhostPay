import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import { subtask, type HardhatUserConfig } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

// LOCAL-ONLY sandbox escape hatch: when GHOSTPAY_SOLC_PATH points at a native solc 0.8.28 binary,
// use it instead of downloading from binaries.soliditylang.org. Unset in CI.
const localSolc = process.env.GHOSTPAY_SOLC_PATH;
if (localSolc) {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
    if (args.solcVersion !== "0.8.28") return runSuper();
    return { compilerPath: localSolc, isSolcJs: false, version: "0.8.28", longVersion: "0.8.28+commit.7893614a" };
  });
}

// Sepolia is configured only when both variables are present in the environment. No keys or URLs
// are stored in the repository. The deploy script refuses any other chain id.
const sepolia =
  process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY
    ? { sepolia: { url: process.env.SEPOLIA_RPC_URL, accounts: [process.env.DEPLOYER_PRIVATE_KEY], chainId: 11155111 } }
    : {};

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: { hardhat: { chainId: 31337 }, ...sepolia },
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      metadata: { bytecodeHash: "none" },
    },
  },
  paths: { sources: "contracts", tests: "test", cache: "cache", artifacts: "artifacts" },
  mocha: { timeout: 600000 },
};

export default config;
