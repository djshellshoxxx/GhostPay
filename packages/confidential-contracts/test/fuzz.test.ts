import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Signer } from "ethers";
import {
  as, FEE_DIVISOR, FEE_EPOCH, U64_MAX, approveRouter, balanceOfRaw, deployAll, fundedWallet, parseLogs, pay, rawDec, wrapFor,
} from "./helpers";

// Deterministic PRNG (mulberry32) so failures reproduce: FUZZ_SEED=<n> FUZZ_RUNS=<n> npx hardhat test test/fuzz.test.ts
const SEED = Number(process.env.FUZZ_SEED ?? 1337);
const RUNS = Number(process.env.FUZZ_RUNS ?? 1000);
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rand64(r: () => number, bits: number): bigint {
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 16n) | BigInt(Math.floor(r() * 65536));
  return v & ((1n << BigInt(bits)) - 1n);
}
const stealthOf = (i: number) => ethers.getAddress("0x" + (0x1000 + i).toString(16).padStart(40, "0"));
const TEN_YEARS = 10 * 365 * 24 * 3600;

describe(`fee split fuzz (CT-C-3), seed ${SEED}, ${RUNS} runs`, function () {
  it("boundary values each in a fresh deployment: fee == t/400, fee + net == t", async () => {
    const edges = [0n, 1n, 399n, 400n, 401n, 799n, 800n, 1_000_000n, 1n << 63n, U64_MAX - 1n, U64_MAX];
    for (const gross of edges) {
      const d = await deployAll();
      const payer = await fundedWallet();
      await wrapFor(d, payer, U64_MAX);
      await approveRouter(d, payer);
      const r = await pay(d, payer, stealthOf(1), gross);
      const fee = await balanceOfRaw(d, d.routerAddr);
      const net = await balanceOfRaw(d, stealthOf(1));
      expect(fee, `fee for ${gross}`).to.equal(gross / FEE_DIVISOR);
      expect(fee + net, `sum for ${gross}`).to.equal(gross);
      expect(net).to.equal(gross - gross / FEE_DIVISOR);
      // matches the plaintext router's floor(x * 25 / 10000)
      expect(fee).to.equal((gross * 25n) / 10000n);
      const cp = parseLogs(d, r).find((l) => l.name === "ConfidentialPayment")!;
      expect(await rawDec(cp.args.netHandle as string)).to.equal(net);
    }
  });

  it(`random amounts and balances in one deployment`, async function () {
    this.timeout(0);
    const r = rng(SEED);
    const d = await deployAll();
    const payer = await fundedWallet();
    const funded = 1n << 58n;
    await wrapFor(d, payer, funded);
    await (await as(d.token, payer).setOperator(d.routerAddr, (await time.latest()) + TEN_YEARS)).wait();
    let payerBal = funded;
    let feeSum = 0n;
    for (let i = 0; i < RUNS; i++) {
      const bits = [8, 12, 20, 33, 40, 44][Math.floor(r() * 6)]!;
      const gross = rand64(r, bits);
      const rc = await pay(d, payer, stealthOf(i), gross);
      const t = payerBal >= gross ? gross : 0n; // insufficient payer balance transfers 0
      const logs = parseLogs(d, rc);
      const tHandle = logs.filter((l) => l.name === "ConfidentialTransfer")[0]!.args.amount as string;
      expect(await rawDec(tHandle), `t run ${i}`).to.equal(t);
      const fee = t / FEE_DIVISOR;
      const net = await balanceOfRaw(d, stealthOf(i));
      expect(net, `net run ${i} gross ${gross}`).to.equal(t - fee);
      payerBal -= t;
      feeSum += fee;
      if (i % 50 === 0) expect(await balanceOfRaw(d, d.routerAddr)).to.equal(feeSum);
    }
    expect(await balanceOfRaw(d, d.routerAddr)).to.equal(feeSum);
    expect(await balanceOfRaw(d, await payer.getAddress())).to.equal(payerBal);
  });
});

describe("randomised multi-actor invariants (conservation, no plaintext fee leak)", function () {
  const sequences = Number(process.env.INV_SEQUENCES ?? 4);
  const steps = Number(process.env.INV_STEPS ?? 40);
  for (let s = 0; s < sequences; s++) {
    it(`sequence ${s} (${steps} steps)`, async function () {
      this.timeout(0);
      const r = rng(SEED * 7919 + s);
      const d = await deployAll();
      const payers: Signer[] = [await fundedWallet(), await fundedWallet(), await fundedWallet()];
      const fr = await d.feeRecipient.getAddress();
      const stealthSeen = new Set<string>();
      let wrapped = 0n;
      let routerFees = 0n; // fees accrued since the last flush
      let flushed = 0n;
      const model = new Map<string, bigint>();
      const bal = (a: string) => model.get(a) ?? 0n;

      const check = async (why: string) => {
        const holders = [...payers.map((p) => p.getAddress()), ...[...stealthSeen].map((a) => Promise.resolve(a))];
        let sum = 0n;
        for (const h of holders) {
          const a = await h;
          const v = await balanceOfRaw(d, a);
          expect(v, `${why}: balance ${a}`).to.equal(bal(a));
          sum += v;
        }
        const router = await balanceOfRaw(d, d.routerAddr);
        expect(router, `${why}: router fee balance`).to.equal(routerFees);
        const rec = await balanceOfRaw(d, fr);
        expect(rec, `${why}: recipient`).to.equal(flushed);
        expect(sum + router + rec, `${why}: conservation`).to.equal(wrapped);
        expect(await rawDec(await d.token.confidentialTotalSupply()), `${why}: supply`).to.equal(wrapped);
      };

      for (let i = 0; i < steps; i++) {
        const payer = payers[Math.floor(r() * payers.length)]!;
        const pa = await payer.getAddress();
        const action = r();
        if (action < 0.2) {
          const amt = rand64(r, 30) + 1n;
          await wrapFor(d, payer, amt);
          wrapped += amt;
          model.set(pa, bal(pa) + amt);
          await check(`step ${i} wrap`);
        } else if (action < 0.85) {
          await approveRouter(d, payer, 900);
          const gross = rand64(r, [10, 20, 30][Math.floor(r() * 3)]!);
          const stealth = stealthOf(Math.floor(r() * 5));
          stealthSeen.add(stealth);
          await pay(d, payer, stealth, gross);
          const t = bal(pa) >= gross ? gross : 0n;
          const fee = t / FEE_DIVISOR;
          model.set(pa, bal(pa) - t);
          model.set(stealth, bal(stealth) + t - fee);
          routerFees += fee;
          await check(`step ${i} pay gross=${gross}`);
        } else if (action < 0.95) {
          await time.increase(Number(FEE_EPOCH) + 1);
          if ((await d.router.epochStart(d.tokenAddr)) === 0n) continue;
          await d.router.flushFees(d.tokenAddr);
          flushed += routerFees;
          routerFees = 0n;
          await check(`step ${i} flush`);
        } else {
          // early flush must always fail
          await expect(d.router.flushFees(d.tokenAddr)).to.be.reverted;
        }
      }
      await check("final");
    });
  }
});

describe("gas and homomorphic complexity unit (HCU) of payConfidential (CT-C-9)", () => {
  it("records gas and HCU; values are for the mock executor, not Sepolia", async () => {
    const d = await deployAll();
    const payer = await fundedWallet();
    await wrapFor(d, payer, 10_000_000n);
    await approveRouter(d, payer);
    const rc = await pay(d, payer, stealthOf(1), 1_000_000n);
    const hcu = fhevm.computeTransactionHCU(rc);
    console.log(`      payConfidential gas=${rc.gasUsed} hcu=${JSON.stringify(hcu, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    expect(rc.gasUsed).to.be.greaterThan(0n);
    await approveRouter(d, payer);
    const rc2 = await pay(d, payer, stealthOf(1), 1_000_000n);
    console.log(`      payConfidential (warm stealth balance) gas=${rc2.gasUsed}`);
    await time.increase(Number(FEE_EPOCH));
    const f = await (await d.router.flushFees(d.tokenAddr)).wait();
    console.log(`      flushFees gas=${f!.gasUsed} hcu=${JSON.stringify(fhevm.computeTransactionHCU(f!), (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  });
});
