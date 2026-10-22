import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Signer } from "ethers";
import {
  as, EPH_KEY, FEE_DIVISOR, FEE_EPOCH, U64_MAX, approveRouter, balanceOfRaw, deployAll, encryptGross, fundedWallet, isAllowed,
  parseLogs, pay, rawDec, userDec, wrapFor, type Deployment,
} from "./helpers";

const STEALTH = "0x00000000000000000000000000000000000000a1";

async function setup(grossBalance: bigint) {
  const d = await deployAll();
  const payer = await fundedWallet();
  await wrapFor(d, payer, grossBalance);
  await approveRouter(d, payer);
  return { d, payer };
}

describe("GhostPayConfidentialRouter: construction", () => {
  it("exposes the normative constants", async () => {
    const d = await deployAll();
    expect(await d.router.FEE_DIVISOR()).to.equal(400n);
    expect(await d.router.FEE_EPOCH()).to.equal(FEE_EPOCH);
    expect(await d.router.CT_SELECTOR()).to.equal("0x5bebed7e");
    expect(await d.router.SCHEME_ID()).to.equal(1n);
    expect(await d.router.isTokenAllowed(d.tokenAddr)).to.equal(true);
    expect(await d.router.isTokenAllowed(STEALTH)).to.equal(false);
    expect(await d.router.FEE_RECIPIENT()).to.equal(await d.feeRecipient.getAddress());
    expect(await d.router.ANNOUNCER()).to.equal(await d.announcer.getAddress());
    expect(await d.router.confidentialProtocolId()).to.equal((1n << 256n) - 1n);
  });

  it("CT_SELECTOR is the selector of confidentialTransfer(address,bytes32)", async () => {
    const sel = ethers.id("confidentialTransfer(address,bytes32)").slice(0, 10);
    const d = await deployAll();
    expect(await d.router.CT_SELECTOR()).to.equal(sel);
  });

  it("rejects bad constructor arguments", async () => {
    const d = await deployAll();
    const F = await ethers.getContractFactory("GhostPayConfidentialRouter");
    const a = await d.announcer.getAddress();
    const fr = await d.feeRecipient.getAddress();
    const z = ethers.ZeroAddress;
    await expect(F.deploy(z, fr, [d.tokenAddr])).to.be.revertedWithCustomError(d.router, "ZeroAddress");
    await expect(F.deploy(a, z, [d.tokenAddr])).to.be.revertedWithCustomError(d.router, "ZeroAddress");
    await expect(F.deploy(a, z, [])).to.be.revertedWithCustomError(d.router, "ZeroAddress");
    await expect(F.deploy(a, fr, [])).to.be.revertedWithCustomError(d.router, "InvalidTokenList");
    await expect(F.deploy(a, fr, [z])).to.be.revertedWithCustomError(d.router, "ZeroAddress");
    await expect(F.deploy(a, fr, [d.tokenAddr, d.tokenAddr])).to.be.revertedWithCustomError(d.router, "InvalidTokenList");
    const nine = Array.from({ length: 9 }, (_, i) => ethers.getAddress("0x" + (i + 1).toString(16).padStart(40, "0")));
    await expect(F.deploy(a, fr, nine)).to.be.revertedWithCustomError(d.router, "InvalidTokenList");
    // fee recipient == the router's own (future) address cannot be pre-computed cheaply; the
    // branch is exercised by predicting the CREATE address.
    const [deployer] = await ethers.getSigners();
    const nonce = await ethers.provider.getTransactionCount(await deployer.getAddress());
    const future = ethers.getCreateAddress({ from: await deployer.getAddress(), nonce });
    await expect(F.deploy(a, future, [d.tokenAddr])).to.be.revertedWithCustomError(d.router, "InvalidStealth");
  });

  it("test token and underlying are labelled as test assets", async () => {
    const d = await deployAll();
    expect(await d.token.name()).to.contain("Test");
    expect(await d.token.symbol()).to.equal("cTUSD");
    expect(await d.underlying.name()).to.contain("Test");
    expect(await d.token.decimals()).to.equal(6n);
    expect(await d.token.rate()).to.equal(1n);
  });
});

describe("GhostPayConfidentialRouter: payConfidential", () => {
  it("splits gross into net (stealth) and fee (router), amounts decrypt exactly", async () => {
    const gross = 1_234_567n;
    const { d, payer } = await setup(5_000_000n);
    const r = await pay(d, payer, STEALTH, gross);
    const fee = gross / FEE_DIVISOR;
    const net = gross - fee;
    expect(await balanceOfRaw(d, STEALTH)).to.equal(net);
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(fee);
    expect(await balanceOfRaw(d, await payer.getAddress())).to.equal(5_000_000n - gross);
    const logs = parseLogs(d, r);
    const cp = logs.find((l) => l.name === "ConfidentialPayment")!;
    expect(await userDec(d, cp.args.netHandle as string, payer)).to.equal(net);
  });

  it("emits exactly the 57-byte metadata with the net handle at [25:57] (CT-C-4)", async () => {
    const { d, payer } = await setup(1_000_000n);
    const r = await pay(d, payer, STEALTH, 400_000n, { viewTag: "0x7e" });
    const logs = parseLogs(d, r);
    const ann = logs.find((l) => l.name === "Announcement")!;
    const meta = ethers.getBytes(ann.args.metadata as string);
    expect(meta.length).to.equal(57);
    expect(meta[0]).to.equal(0x7e);
    expect(ethers.hexlify(meta.slice(1, 5))).to.equal("0x5bebed7e");
    expect(ethers.hexlify(meta.slice(5, 25))).to.equal(d.tokenAddr.toLowerCase());
    const cp = logs.find((l) => l.name === "ConfidentialPayment")!;
    expect(ethers.hexlify(meta.slice(25, 57))).to.equal(cp.args.netHandle);
    // the handle is the token's router->stealth transfer handle
    const transfers = logs.filter((l) => l.name === "ConfidentialTransfer");
    const toStealth = transfers.find((l) => (l.args.to as string).toLowerCase() === STEALTH)!;
    expect(toStealth.args.amount).to.equal(cp.args.netHandle);
    expect(ann.args.stealthAddress).to.equal(ethers.getAddress(STEALTH));
    expect(ann.args.caller).to.equal(d.routerAddr);
    expect(ann.args.schemeId).to.equal(1n);
    expect(ann.args.ephemeralPubKey).to.equal(EPH_KEY);
  });

  it("insufficient balance: no revert, stealth gets 0 (silent zero transfer, CT-PAY-6)", async () => {
    const { d, payer } = await setup(1_000n);
    const r = await pay(d, payer, STEALTH, 5_000_000n);
    expect(await balanceOfRaw(d, STEALTH)).to.equal(0n);
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(0n);
    expect(await balanceOfRaw(d, await payer.getAddress())).to.equal(1_000n);
    const logs = parseLogs(d, r);
    const cp = logs.find((l) => l.name === "ConfidentialPayment")!;
    expect(await userDec(d, cp.args.netHandle as string, payer)).to.equal(0n);
    expect(logs.some((l) => l.name === "Announcement")).to.equal(true);
  });

  it("zero gross: succeeds, nothing moves", async () => {
    const { d, payer } = await setup(10n);
    await pay(d, payer, STEALTH, 0n);
    expect(await balanceOfRaw(d, STEALTH)).to.equal(0n);
    expect(await balanceOfRaw(d, await payer.getAddress())).to.equal(10n);
  });

  it("payments below 400 base units pay no fee", async () => {
    const { d, payer } = await setup(1_000n);
    await pay(d, payer, STEALTH, 399n);
    expect(await balanceOfRaw(d, STEALTH)).to.equal(399n);
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(0n);
  });

  it("forwards the ETH buffer to the stealth address", async () => {
    const { d, payer } = await setup(1_000n);
    const before = await ethers.provider.getBalance(STEALTH);
    await pay(d, payer, STEALTH, 1_000n, { value: 12345n, maxBuffer: 20000n });
    expect((await ethers.provider.getBalance(STEALTH)) - before).to.equal(12345n);
    expect(await ethers.provider.getBalance(d.routerAddr)).to.equal(0n);
  });

  it("reverts BufferTooLarge when msg.value > maxBufferWei", async () => {
    const { d, payer } = await setup(1_000n);
    await expect(pay(d, payer, STEALTH, 1_000n, { value: 2n, maxBuffer: 1n })).to.be.revertedWithCustomError(d.router, "BufferTooLarge");
  });

  it("reverts NativeTransferFailed when the stealth address rejects ETH", async () => {
    const { d, payer } = await setup(1_000n);
    // the underlying test token has no payable receive: sending ETH to it fails
    await expect(pay(d, payer, await d.underlying.getAddress(), 1_000n, { value: 1n, maxBuffer: 1n })).to.be.revertedWithCustomError(
      d.router,
      "NativeTransferFailed",
    );
  });

  it("reverts Expired after the deadline", async () => {
    const { d, payer } = await setup(1_000n);
    const now = BigInt(await time.latest());
    await expect(pay(d, payer, STEALTH, 100n, { deadline: now - 1n })).to.be.revertedWithCustomError(d.router, "Expired");
  });

  it("reverts InvalidStealth for zero, router and fee recipient", async () => {
    const { d, payer } = await setup(1_000n);
    for (const bad of [ethers.ZeroAddress, d.routerAddr, await d.feeRecipient.getAddress()]) {
      await expect(pay(d, payer, bad, 100n)).to.be.revertedWithCustomError(d.router, "InvalidStealth");
    }
  });

  it("reverts InvalidEphemeralKey for wrong length or prefix", async () => {
    const { d, payer } = await setup(1_000n);
    for (const bad of ["0x", "0x02" + "11".repeat(31), "0x02" + "11".repeat(33), "0x04" + "11".repeat(32), "0x00" + "11".repeat(32)]) {
      await expect(pay(d, payer, STEALTH, 100n, { eph: bad })).to.be.revertedWithCustomError(d.router, "InvalidEphemeralKey");
    }
    await pay(d, payer, STEALTH, 100n, { eph: "0x03" + "22".repeat(32) });
  });

  it("reverts TokenNotAllowed for a token outside the constructor set", async () => {
    const { d, payer } = await setup(1_000n);
    const other = await (await ethers.getContractFactory("GhostPayTestConfidentialToken")).deploy(await d.underlying.getAddress());
    const enc = await encryptGross(d, payer, 100n);
    await expect(
      as(d.router, payer).payConfidential(await other.getAddress(), STEALTH, enc.handles[0], enc.inputProof, 2n ** 60n, 0, EPH_KEY, "0x00"),
    ).to.be.revertedWithCustomError(d.router, "TokenNotAllowed");
  });

  it("reverts NotOperator without approval and after the operator window (CT-C-5)", async () => {
    const d = await deployAll();
    const payer = await fundedWallet();
    await wrapFor(d, payer, 1_000n);
    await expect(pay(d, payer, STEALTH, 100n)).to.be.revertedWithCustomError(d.router, "NotOperator");
    await approveRouter(d, payer, 900);
    await pay(d, payer, STEALTH, 100n);
    await time.increase(901);
    await expect(pay(d, payer, STEALTH, 100n)).to.be.revertedWithCustomError(d.router, "NotOperator");
  });

  it("a third party cannot spend a payer's balance (input bound to msg.sender)", async () => {
    const { d, payer } = await setup(1_000n);
    const attacker = await fundedWallet();
    // attacker has no operator rights from payer: pays from attacker's own (empty) balance
    await approveRouter(d, attacker);
    await pay(d, attacker, STEALTH, 1_000n);
    expect(await balanceOfRaw(d, await payer.getAddress())).to.equal(1_000n);
    expect(await balanceOfRaw(d, STEALTH)).to.equal(0n);
  });

  it("rejects an encrypted input made for another user", async () => {
    const { d, payer } = await setup(1_000n);
    const other = await fundedWallet();
    const enc = await encryptGross(d, other, 100n);
    await expect(
      as(d.router, payer).payConfidential(d.tokenAddr, STEALTH, enc.handles[0], enc.inputProof, 2n ** 60n, 0, EPH_KEY, "0x00"),
    ).to.be.reverted;
  });

  it("rejects plain ETH and unknown calls (NoDirectETH)", async () => {
    const d = await deployAll();
    const [s] = await ethers.getSigners();
    await expect(s.sendTransaction({ to: d.routerAddr, value: 1n })).to.be.revertedWithCustomError(d.router, "NoDirectETH");
    await expect(s.sendTransaction({ to: d.routerAddr, data: "0xdeadbeef" })).to.be.revertedWithCustomError(d.router, "NoDirectETH");
    await expect(s.sendTransaction({ to: d.routerAddr, data: "0xdeadbeef", value: 1n })).to.be.revertedWithCustomError(d.router, "NoDirectETH");
  });

  it("holds the reentrancy guard on the ETH-forwarding path", async () => {
    const { d, payer } = await setup(10_000n);
    const re = await (await ethers.getContractFactory("ReentrantStealth")).deploy(d.routerAddr, d.tokenAddr);
    await pay(d, payer, await re.getAddress(), 1_000n, { value: 1n, maxBuffer: 1n });
    expect(await re.hookCalls()).to.equal(1n);
    const reason = await re.lastRevert();
    // ReentrancyGuardReentrantCall()
    expect(reason).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
  });
});

describe("GhostPayConfidentialRouter: ACL and event leakage", () => {
  it("never allows the fee recipient on a per-payment handle (CT-C-7)", async () => {
    const { d, payer } = await setup(9_000_000n);
    const r = await pay(d, payer, STEALTH, 7_777_777n);
    const fr = await d.feeRecipient.getAddress();
    const handles = parseLogs(d, r)
      .filter((l) => l.name === "ConfidentialTransfer")
      .map((l) => l.args.amount as string);
    expect(handles.length).to.equal(2);
    for (const h of handles) expect(await isAllowed(h, fr)).to.equal(false);
    // and the intended parties are allowed
    const [tPayerToRouter, netToStealth] = handles as [string, string];
    expect(await isAllowed(tPayerToRouter, d.routerAddr)).to.equal(true);
    expect(await isAllowed(netToStealth, STEALTH)).to.equal(true);
    expect(await isAllowed(netToStealth, await payer.getAddress())).to.equal(true);
  });

  it("no log word of the payment tx equals the gross, net or fee (T3, CT-C-2)", async () => {
    const gross = 7_654_321n;
    const { d, payer } = await setup(9_000_000n);
    const r = await pay(d, payer, STEALTH, gross);
    const fee = gross / FEE_DIVISOR;
    const secrets = new Set([gross, gross - fee, fee]);
    expect(r.logs.length).to.be.greaterThan(2);
    for (const log of r.logs) {
      const blob = ethers.getBytes(ethers.concat([...log.topics, log.data]));
      for (let i = 0; i + 32 <= blob.length; i += 32) {
        expect(secrets.has(BigInt(ethers.hexlify(blob.slice(i, i + 32)))), `log ${log.address} word ${i / 32}`).to.equal(false);
      }
      // also in packed byte form (metadata is not word aligned)
      for (const s of secrets) {
        const needle = ethers.toBeHex(s, 8).slice(2);
        expect(ethers.hexlify(blob).includes(needle), `log ${log.address} packed ${s}`).to.equal(false);
      }
    }
    for (const l of parseLogs(d, r)) {
      for (const [k, v] of Object.entries(l.args)) {
        if (typeof v === "bigint" && Number.isNaN(Number(k))) expect(secrets.has(v), `${l.name}.${k}`).to.equal(false);
      }
    }
  });
});

describe("GhostPayConfidentialRouter: flushFees (CT-C-6)", () => {
  it("reverts FlushTooEarly before any payment and inside the epoch", async () => {
    const { d, payer } = await setup(5_000_000n);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
    await pay(d, payer, STEALTH, 4_000_000n);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
    await time.increase(Number(FEE_EPOCH) - 30);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
  });

  it("reverts TokenNotAllowed for an unknown token", async () => {
    const d = await deployAll();
    await expect(d.router.flushFees(STEALTH)).to.be.revertedWithCustomError(d.router, "TokenNotAllowed");
  });

  it("moves the full fee balance to the recipient once per epoch", async () => {
    const { d, payer } = await setup(9_000_000n);
    await pay(d, payer, STEALTH, 4_000_000n);
    await approveRouter(d, payer);
    await pay(d, payer, "0x00000000000000000000000000000000000000a2", 2_000_000n);
    const totalFee = 4_000_000n / FEE_DIVISOR + 2_000_000n / FEE_DIVISOR;
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(totalFee);
    await time.increase(Number(FEE_EPOCH));
    const tx = await as(d.router, await fundedWallet()).flushFees(d.tokenAddr); // anyone may call
    const rc = await tx.wait();
    const ev = parseLogs(d, rc!).find((l) => l.name === "FeesFlushed")!;
    expect(ev.args.token).to.equal(d.tokenAddr);
    const fr = d.feeRecipient;
    expect(await userDec(d, ev.args.feeHandle as string, fr)).to.equal(totalFee);
    expect(await balanceOfRaw(d, await fr.getAddress())).to.equal(totalFee);
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(0n);
    expect(await d.router.epochStart(d.tokenAddr)).to.equal(0n);
    // nothing pending: flush stays closed however much time passes
    await time.increase(Number(FEE_EPOCH) * 2);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
  });

  it("a payment after an idle period cannot be flushed on its own (epoch restarts at the first unflushed payment)", async () => {
    const { d, payer } = await setup(9_000_000n);
    await pay(d, payer, STEALTH, 1_000_000n);
    await time.increase(Number(FEE_EPOCH));
    await d.router.flushFees(d.tokenAddr);
    // long idle period, then a single payment
    await time.increase(Number(FEE_EPOCH) * 10);
    await approveRouter(d, payer);
    await pay(d, payer, STEALTH, 2_000_000n);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
    await time.increase(Number(FEE_EPOCH) - 30);
    await expect(d.router.flushFees(d.tokenAddr)).to.be.revertedWithCustomError(d.router, "FlushTooEarly");
    await time.increase(60);
    await d.router.flushFees(d.tokenAddr);
    expect(await balanceOfRaw(d, await d.feeRecipient.getAddress())).to.equal(1_000_000n / FEE_DIVISOR + 2_000_000n / FEE_DIVISOR);
  });

  it("the fee epoch starts at the first unflushed payment and is not reset by later payments", async () => {
    const { d, payer } = await setup(9_000_000n);
    await pay(d, payer, STEALTH, 1_000_000n);
    const first = await d.router.epochStart(d.tokenAddr);
    expect(first).to.be.greaterThan(0n);
    await time.increase(100);
    await approveRouter(d, payer);
    await pay(d, payer, STEALTH, 1_000_000n);
    expect(await d.router.epochStart(d.tokenAddr)).to.equal(first);
  });
});

describe("test token wrap/unwrap (public amounts by design)", () => {
  it("wrap -> unwrap -> publicDecrypt -> finalizeUnwrap returns the plaintext ERC-20", async () => {
    const d = await deployAll();
    const u = await fundedWallet();
    await wrapFor(d, u, 5_000n);
    const addr = await u.getAddress();
    expect(await d.underlying.balanceOf(addr)).to.equal(0n);
    const enc = await (await import("hardhat")).fhevm.createEncryptedInput(d.tokenAddr, addr).add64(3_000n).encrypt();
    const tx = await as(d.token, u)["unwrap(address,address,bytes32,bytes)"](addr, addr, enc.handles[0], enc.inputProof);
    const rc = await tx.wait();
    const ev = d.token.interface.parseLog(rc!.logs.find((l: { topics: readonly string[] }) => l.topics[0] === d.token.interface.getEvent("UnwrapRequested")!.topicHash)!)!;
    const id = ev.args.unwrapRequestId as string;
    const pd = await (await import("hardhat")).fhevm.publicDecrypt([id]);
    await (await d.token.finalizeUnwrap(id, pd.clearValues[id as `0x${string}`], pd.decryptionProof)).wait();
    expect(await d.underlying.balanceOf(addr)).to.equal(3_000n);
    expect(await balanceOfRaw(d, addr)).to.equal(2_000n);
    await expect(d.token.finalizeUnwrap(id, 3_000n, "0x")).to.be.reverted; // request consumed
  });

  it("MockERC20 mint is public (test token)", async () => {
    const d = await deployAll();
    const [, , x] = await ethers.getSigners();
    await as(d.underlying, x as Signer).mint(await x!.getAddress(), 7n);
    expect(await d.underlying.balanceOf(await x!.getAddress())).to.equal(7n);
    expect(await d.underlying.decimals()).to.equal(6n);
  });
});

export type { Deployment };
export { rawDec };
