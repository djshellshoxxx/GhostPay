// SPDX-License-Identifier: GPL-3.0
// INSECURE DEV CEREMONY artefacts only: see packages/pool-circuits/README.md. Testnet PoC, not audited.
//
// Derived from 0xbow-io/privacy-pools-core packages/circuits/circuits/withdraw.circom
// (Apache-2.0, Copyright 0xbow). GhostPay changes (DEVIATIONS.md D-1, D-3):
//   * new public input aspEnabled (boolean); ASP inclusion only enforced when aspEnabled == 1;
//     when aspEnabled == 0 the circuit forces ASPRoot == 0 and ASPTreeDepth == 0.
//   * existingValue additionally range-checked to 128 bits (defence in depth).
// Public signal order (outputs first, then public inputs in declaration order) is part of the
// interface: packages/pool-circuits/INTERFACE.md section 2. Do not reorder declarations.
pragma circom 2.2.0;

include "./commitment.circom";
include "./merkleTree.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/// @title Withdraw
/// @notice Spends an existing note (proving state-tree membership and optionally ASP membership of its
///         label), reveals its nullifier hash, and creates a change note with the same label.
/// @param maxTreeDepth 32 for the pool.
template Withdraw(maxTreeDepth) {
    // ---- public inputs (ORDER IS INTERFACE) ----
    signal input withdrawnValue;
    signal input stateRoot;
    signal input stateTreeDepth;
    signal input aspEnabled;
    signal input ASPRoot;
    signal input ASPTreeDepth;
    signal input context;            // keccak256(abi.encode(withdrawal, SCOPE)) % P, binds recipient/relayer/fee

    // ---- private inputs ----
    signal input label;
    signal input existingValue;
    signal input existingNullifier;
    signal input existingSecret;
    signal input newNullifier;
    signal input newSecret;
    signal input stateSiblings[maxTreeDepth];
    signal input stateIndex;
    signal input ASPSiblings[maxTreeDepth];
    signal input ASPIndex;

    // ---- outputs (ORDER IS INTERFACE) ----
    signal output newCommitmentHash;
    signal output existingNullifierHash;

    // 1. Existing commitment and its nullifier hash.
    component existingHasher = CommitmentHasher();
    existingHasher.value <== existingValue;
    existingHasher.label <== label;
    existingHasher.nullifier <== existingNullifier;
    existingHasher.secret <== existingSecret;
    existingNullifierHash <== existingHasher.nullifierHash;

    // 2. State-tree membership.
    component stateChecker = LeanIMTInclusionProof(maxTreeDepth);
    stateChecker.leaf <== existingHasher.commitment;
    stateChecker.leafIndex <== stateIndex;
    stateChecker.siblings <== stateSiblings;
    stateChecker.actualDepth <== stateTreeDepth;
    stateRoot === stateChecker.out;

    // 3. ASP membership of label, conditional on aspEnabled (boolean).
    aspEnabled * (1 - aspEnabled) === 0;
    component aspChecker = LeanIMTInclusionProof(maxTreeDepth);
    aspChecker.leaf <== label;
    aspChecker.leafIndex <== ASPIndex;
    aspChecker.siblings <== ASPSiblings;
    aspChecker.actualDepth <== ASPTreeDepth;
    aspEnabled * (ASPRoot - aspChecker.out) === 0;
    // aspEnabled == 0 => ASPRoot == 0 and ASPTreeDepth == 0 (also checked by the contract).
    (1 - aspEnabled) * ASPRoot === 0;
    (1 - aspEnabled) * ASPTreeDepth === 0;

    // 4. Value range checks: no field wrap in existingValue - withdrawnValue.
    component withdrawnBits = Num2Bits(128);
    withdrawnBits.in <== withdrawnValue;
    component existingBits = Num2Bits(128);
    existingBits.in <== existingValue;
    signal remainingValue <== existingValue - withdrawnValue;
    component remainingBits = Num2Bits(128);
    remainingBits.in <== remainingValue;

    // 5. Change note must use a fresh nullifier.
    component sameNullifier = IsEqual();
    sameNullifier.in[0] <== existingNullifier;
    sameNullifier.in[1] <== newNullifier;
    sameNullifier.out === 0;

    // 6. Change note, same label.
    component newHasher = CommitmentHasher();
    newHasher.value <== remainingValue;
    newHasher.label <== label;
    newHasher.nullifier <== newNullifier;
    newHasher.secret <== newSecret;
    newCommitmentHash <== newHasher.commitment;

    // 7. Defence in depth: put context in a constraint (snarkjs already binds every public input).
    signal contextSquared <== context * context;
}
