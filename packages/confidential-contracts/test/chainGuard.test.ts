import { expect } from "chai";
import { artifacts } from "hardhat";
import { ContractFactory, JsonRpcProvider, ZeroAddress, Interface } from "ethers";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

// Chain-id guard test (CT-C-8). Hardhat's in-process network cannot change its chain id, so this
// starts a throw-away local anvil per chain id. Skipped (loudly) if no anvil binary is found; set
// ANVIL_BIN to point at one. Nothing here touches a real network.
const ANVIL = process.env.ANVIL_BIN ?? "anvil";
const HAVE_ANVIL = spawnSync(ANVIL, ["--version"]).status === 0;
const ABI_ERR = new Interface(["error UnsupportedChain(uint256 chainId)"]);

async function withAnvil<T>(chainId: number, port: number, fn: (p: JsonRpcProvider) => Promise<T>): Promise<T> {
  const proc: ChildProcess = spawn(ANVIL, ["--chain-id", String(chainId), "--port", String(port), "--silent"], { stdio: "ignore" });
  try {
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const provider = new JsonRpcProvider(url, chainId, { staticNetwork: true });
    return await fn(provider);
  } finally {
    proc.kill();
  }
}

async function tryDeploy(provider: JsonRpcProvider, name: string, args: unknown[]): Promise<{ ok: boolean; chainId?: bigint }> {
  const art = await artifacts.readArtifact(name);
  const signer = await provider.getSigner(0);
  try {
    const c = await new ContractFactory(art.abi, art.bytecode, signer).deploy(...args);
    await c.waitForDeployment();
    return { ok: true };
  } catch (e) {
    const data = (e as { data?: string }).data ?? "";
    const parsed = data ? ABI_ERR.parseError(data) : null;
    if (parsed?.name === "UnsupportedChain") return { ok: false, chainId: parsed.args[0] as bigint };
    throw e;
  }
}

describe("testnet-only chain guard (CT-C-8)", function () {
  this.timeout(120000);
  before(function () {
    if (!HAVE_ANVIL) {
      console.log("      anvil not found: chain-guard tests SKIPPED (set ANVIL_BIN)");
      this.skip();
    }
  });

  const refused = [1, 10, 137, 8453, 42161, 84532, 11155420];
  refused.forEach((id, i) => {
    it(`refuses chain ${id} for MockERC20, token and router`, async () => {
      await withAnvil(id, 18600 + i, async (p) => {
        const a1 = ZeroAddress.replace(/0$/, "1");
        for (const [name, args] of [
          ["MockERC20", []],
          ["GhostPayTestConfidentialToken", [a1]],
          ["GhostPayConfidentialRouter", [a1, a1, [a1]]],
        ] as [string, unknown[]][]) {
          const r = await tryDeploy(p, name, args);
          expect(r.ok, `${name} on ${id}`).to.equal(false);
          expect(r.chainId).to.equal(BigInt(id));
        }
      });
    });
  });

  [31337, 11155111].forEach((id, i) => {
    it(`allows chain ${id}`, async () => {
      await withAnvil(id, 18700 + i, async (p) => {
        const a1 = ZeroAddress.replace(/0$/, "1");
        expect((await tryDeploy(p, "MockERC20", [])).ok).to.equal(true);
        expect((await tryDeploy(p, "GhostPayConfidentialRouter", [a1, a1.replace(/1$/, "2"), [a1]])).ok).to.equal(true);
      });
    });
  });
});
