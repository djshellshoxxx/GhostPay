// SPDX-License-Identifier: GPL-3.0
// INSECURE DEV CEREMONY artefacts only: see packages/pool-circuits/README.md. Testnet PoC, not audited.
//
// Derived from 0xbow-io/privacy-pools-core packages/circuits/circuits/merkleTree.circom
// (Apache-2.0, Copyright 0xbow). GhostPay changes (stricter, see DEVIATIONS.md D-2):
//   * actualDepth is range-checked with Num2Bits(6) before LessEqThan (0xbow's LessEqThan(6) alone
//     accepts actualDepth in {P-31 .. P-1}; harmless there because actualDepth was otherwise unused).
//   * siblings[i] must be 0 for every i >= actualDepth (actualDepth now bounds the path).
//   * an empty (zero) sibling forces index bit i to 0 (LeanIMT: a node without a right sibling is a
//     left child), so the leaf index is canonical for a well-formed tree.
pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/mux1.circom";

/// @title LeanIMTInclusionProof
/// @notice Computes the LeanIMT root for `leaf` at `leafIndex` with bottom-up `siblings`.
///         A zero sibling means "no sibling at this level": the node is propagated unchanged.
/// @param maxDepth maximum tree depth (32 for the pool); must be < 64 (Num2Bits(6) on actualDepth).
template LeanIMTInclusionProof(maxDepth) {
    assert(maxDepth < 64);

    signal input leaf;
    signal input leafIndex;
    signal input siblings[maxDepth];
    signal input actualDepth;

    signal output out;

    signal nodes[maxDepth + 1];
    signal indices[maxDepth];
    signal active[maxDepth];          // active[i] == 1 iff i < actualDepth

    // 1. actualDepth in [0, maxDepth]. Num2Bits(6) first: LessEqThan(n) assumes n-bit inputs.
    component depthBits = Num2Bits(6);
    depthBits.in <== actualDepth;
    component depthCheck = LessEqThan(6);
    depthCheck.in[0] <== actualDepth;
    depthCheck.in[1] <== maxDepth;
    depthCheck.out === 1;

    // 2. leafIndex < 2^maxDepth, little-endian path bits.
    component indexToPath = Num2Bits(maxDepth);
    indexToPath.in <== leafIndex;
    indices <== indexToPath.out;

    component depthIsI[maxDepth];
    component siblingIsEmpty[maxDepth];
    component order[maxDepth];
    component hashers[maxDepth];

    nodes[0] <== leaf;

    for (var i = 0; i < maxDepth; i++) {
        // active[i] = prod_{j<=i} (actualDepth != j)  ==  (actualDepth > i) given actualDepth in [0, maxDepth]
        depthIsI[i] = IsEqual();
        depthIsI[i].in[0] <== actualDepth;
        depthIsI[i].in[1] <== i;
        if (i == 0) {
            active[i] <== 1 - depthIsI[i].out;
        } else {
            active[i] <== active[i - 1] * (1 - depthIsI[i].out);
        }
        // 3. No sibling above the claimed depth.
        (1 - active[i]) * siblings[i] === 0;

        siblingIsEmpty[i] = IsZero();
        siblingIsEmpty[i].in <== siblings[i];

        // 4. Empty sibling => this node is a left child (bit 0). Makes leafIndex canonical.
        siblingIsEmpty[i].out * indices[i] === 0;

        order[i] = MultiMux1(2);
        order[i].c[0][0] <== nodes[i];
        order[i].c[0][1] <== siblings[i];
        order[i].c[1][0] <== siblings[i];
        order[i].c[1][1] <== nodes[i];
        order[i].s <== indices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs <== order[i].out;

        // 5. LeanIMT propagation: keep node when sibling is empty, else hash.
        nodes[i + 1] <== (nodes[i] - hashers[i].out) * siblingIsEmpty[i].out + hashers[i].out;
    }

    out <== nodes[maxDepth];
}
