import { expect } from "chai";
import { ethers } from "hardhat";
import {
  approveRouter, deployAll, FEE_DIVISOR, fundedWallet, pay, rawDec, wrapFor,
} from "./helpers";

const STEALTH = "0x00000000000000000000000000000000000000a1";
const GROSS = 7_654_321n;
const NEEDLE_BYTES = 8;
const ITERATIONS = 12;

function offsets(bytes: string, needle: string): number[] {
  const haystack = bytes.slice(2).toLowerCase();
  const target = needle.slice(2).toLowerCase();
  const found: number[] = [];
  let at = haystack.indexOf(target);
  while (at !== -1) {
    // Each hexadecimal character is a nibble; original CT-C-2 searches nibble-aligned.
    found.push(at);
    at = haystack.indexOf(target, at + 1);
  }
  return found;
}

describe("CT-C-2 synthetic fee-log forensics (diagnostic only)", () => {
  it("records the precise event field and preserves rejection of decoded public fee amounts", async () => {
    const fee = GROSS / FEE_DIVISOR;
    const secrets = [GROSS, GROSS - fee, fee];
    const d = await deployAll();
    const payer = await fundedWallet();
    await wrapFor(d, payer, 9_000_000n);
    await approveRouter(d, payer);
    const interfaces = [d.token.interface, d.router.interface, d.announcer.interface];
    let collisions = 0;

    for (let run = 0; run < ITERATIONS; run++) {
      const receipt = await pay(d, payer, STEALTH, GROSS);
      // Each payment requires enough balance; re-wrap for subsequent attempts.
      // The first wrap covers only one payment, so the test uses fresh balances below.
      for (const [logIndex, log] of receipt.logs.entries()) {
        const chunks = [...log.topics.map((value, i) => ({ field: `topic[${i}]`, value })), { field: "data", value: log.data }];
        const joined = ethers.hexlify(ethers.concat([...log.topics, log.data]));
        const parsed = interfaces.map((iface) => {
          try { return iface.parseLog({ topics: [...log.topics], data: log.data }); }
          catch { return null; }
        }).find((entry) => entry !== null);
        for (const secret of secrets) {
          const needle = ethers.toBeHex(secret, NEEDLE_BYTES);
          const wholeOffsets = offsets(joined, needle);
          if (wholeOffsets.length === 0) continue;
          collisions += wholeOffsets.length;
          const individual = chunks.flatMap(({ field, value }) =>
            offsets(value, needle).map((nibbleOffset) => ({ field, nibbleOffset, byteAligned: nibbleOffset % 2 === 0 })));
          const argumentsSeen = parsed?.fragment.inputs.map((input, index) => ({
            name: input.name, type: input.type,
            value: typeof parsed.args[index] === "bigint"
              ? parsed.args[index].toString() : String(parsed.args[index]),
          })) ?? [];
          const handles = parsed?.fragment.inputs.flatMap((input, index) =>
            input.type === "bytes32" && typeof parsed.args[index] === "string"
              ? [{ field: input.name, handle: parsed.args[index] as string }] : []) ?? [];
          const handleValues = await Promise.all(handles.map(async ({ field, handle }) => {
            try { return { field, mockPlaintext: (await rawDec(handle)).toString() }; }
            catch { return { field, mockPlaintext: "not a readable mock euint64 handle" }; }
          }));
          // No real user data is involved: the entire receipt is generated locally.
          console.info("CT-C-2 synthetic match:", JSON.stringify({
            run, logIndex, address: log.address, topic0: log.topics[0] ?? null,
            event: parsed?.name ?? "unknown", signature: parsed?.signature ?? null,
            secret: secret.toString(), needle, wholeStreamNibbleOffsets: wholeOffsets,
            individualFields: individual, crossingFields: individual.length === 0,
            decodedArguments: argumentsSeen, mockHandleValues: handleValues,
          }));
        }
        if (parsed) {
          for (const [index, input] of parsed.fragment.inputs.entries()) {
            const value = parsed.args[index];
            if (typeof value === "bigint") {
              expect(secrets.includes(value),
                `run ${run} log ${logIndex}: public ${parsed.name}.${input.name}`).to.equal(false);
            }
          }
        }
      }
      if (run + 1 < ITERATIONS) await wrapFor(d, payer, 9_000_000n);
    }
    console.info(`CT-C-2 forensic summary: ${ITERATIONS} synthetic payments, ${collisions} raw byte matches; original broad assertion unchanged`);
  });
});
