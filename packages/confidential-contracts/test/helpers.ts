import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HDNodeWallet, Signer } from "ethers";
import type { Contract, ContractTransactionReceipt, Log } from "ethers";

/** Re-binds a dynamically typed contract to another signer, keeping the dynamic ABI methods. */
export const as = (c: Contract, s: Signer): Contract => c.connect(s) as Contract;
import { time } from "@nomicfoundation/hardhat-network-helpers";

/** Local-mock ACL address (ZamaConfig `_getLocalConfig`, @fhevm/solidity 0.11.1). */
export const LOCAL_ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
export const FEE_DIVISOR = 400n;
export const FEE_EPOCH = 7n * 24n * 3600n;
export const U64_MAX = (1n << 64n) - 1n;
export const EPH_KEY = "0x02" + "11".repeat(32);

export interface Deployment {
  underlying: Contract;
  token: Contract;
  announcer: Contract;
  router: Contract;
  feeRecipient: Signer;
  deployer: Signer;
  tokenAddr: string;
  routerAddr: string;
}

/** Deploys a fresh test token, announcer and router (router accepts exactly this token). */
export async function deployAll(): Promise<Deployment> {
  const [deployer, feeRecipient] = await ethers.getSigners();
  const underlying = await (await ethers.getContractFactory("MockERC20")).deploy();
  const token = await (await ethers.getContractFactory("GhostPayTestConfidentialToken")).deploy(await underlying.getAddress());
  const announcer = await (await ethers.getContractFactory("MockAnnouncer")).deploy();
  const tokenAddr = await token.getAddress();
  const router = await (await ethers.getContractFactory("GhostPayConfidentialRouter")).deploy(
    await announcer.getAddress(),
    await feeRecipient.getAddress(),
    [tokenAddr],
  );
  return { underlying, token, announcer, router, feeRecipient, deployer, tokenAddr, routerAddr: await router.getAddress() };
}

/** Mints `amount` test USD to `who`, approves and wraps it into the confidential token. */
export async function wrapFor(d: Deployment, who: Signer, amount: bigint): Promise<void> {
  const addr = await who.getAddress();
  await (await d.underlying.mint(addr, amount)).wait();
  await (await as(d.underlying, who).approve(d.tokenAddr, amount)).wait();
  await (await as(d.token, who).wrap(addr, amount)).wait();
}

/** Sets the router as operator of `who` until `now + seconds` (chain time). */
export async function approveRouter(d: Deployment, who: Signer, seconds = 900): Promise<number> {
  const until = (await time.latest()) + seconds;
  await (await as(d.token, who).setOperator(d.routerAddr, until)).wait();
  return until;
}

export async function encryptGross(d: Deployment, payer: Signer, gross: bigint) {
  const input = fhevm.createEncryptedInput(d.routerAddr, await payer.getAddress());
  input.add64(gross);
  return input.encrypt();
}

export interface PayOpts {
  deadline?: bigint;
  maxBuffer?: bigint;
  value?: bigint;
  eph?: string;
  viewTag?: string;
}

export async function pay(d: Deployment, payer: Signer, stealth: string, gross: bigint, o: PayOpts = {}) {
  const enc = await encryptGross(d, payer, gross);
  const deadline = o.deadline ?? BigInt((await time.latest()) + 3600);
  const tx = await as(d.router, payer).payConfidential(d.tokenAddr, stealth, enc.handles[0], enc.inputProof, deadline, o.maxBuffer ?? 0n, o.eph ?? EPH_KEY, o.viewTag ?? "0xab", {
      value: o.value ?? 0n,
    });
  return (await tx.wait()) as ContractTransactionReceipt;
}

/** User-decrypts a token handle as `user` (ACL enforced by the mock). */
export async function userDec(d: Deployment, handle: string, user: Signer): Promise<bigint> {
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, d.tokenAddr, user);
}

/** Decrypts any handle ignoring ACL (mock debugger): used for contract-held balances. */
export async function rawDec(handle: string): Promise<bigint> {
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
}

export async function balanceOfRaw(d: Deployment, who: string): Promise<bigint> {
  return rawDec(await d.token.confidentialBalanceOf(who));
}

export function parseLogs(d: Deployment, receipt: ContractTransactionReceipt) {
  const out: { name: string; args: Record<string, unknown>; address: string }[] = [];
  const ifaces = [d.token.interface, d.router.interface, d.announcer.interface];
  for (const log of receipt.logs as Log[]) {
    for (const i of ifaces) {
      const p = i.parseLog({ topics: [...log.topics], data: log.data });
      if (p) {
        out.push({ name: p.name, args: p.args as unknown as Record<string, unknown>, address: log.address });
        break;
      }
    }
  }
  return out;
}

export async function isAllowed(handle: string, who: string): Promise<boolean> {
  const acl = new ethers.Contract(LOCAL_ACL, ["function isAllowed(bytes32,address) view returns (bool)"], ethers.provider);
  return acl.isAllowed(handle, who);
}

export function randomWallet(): HDNodeWallet {
  return ethers.Wallet.createRandom().connect(ethers.provider);
}

/** Funds a throwaway wallet with ETH from hardhat so it can send transactions. */
export async function fundedWallet(eth = "10"): Promise<HDNodeWallet> {
  const w = randomWallet();
  const [funder] = await ethers.getSigners();
  await (await funder.sendTransaction({ to: w.address, value: ethers.parseEther(eth) })).wait();
  return w;
}
