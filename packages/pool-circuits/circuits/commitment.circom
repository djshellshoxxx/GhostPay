// SPDX-License-Identifier: GPL-3.0
// INSECURE DEV CEREMONY artefacts only: see packages/pool-circuits/README.md. Testnet PoC, not audited.
//
// Derived from 0xbow-io/privacy-pools-core packages/circuits/circuits/commitment.circom
// (Apache-2.0, Copyright 0xbow). Semantics unchanged. See ../NOTICE.
// circomlib include => this file is treated as GPL-3.0 (OWNER DECISION on repo licence, see README).
pragma circom 2.2.0;

include "circomlib/circuits/poseidon.circom";

/// @title CommitmentHasher
/// @notice commitment = Poseidon3(value, label, Poseidon2(nullifier, secret)); nullifierHash = Poseidon1(nullifier).
/// @dev Domain separation between the three hashes is by Poseidon width (t = 2, 3, 4 use distinct
///      round constants and MDS matrices in circomlib). LeanIMT nodes also use Poseidon2; see the audit
///      doc (precommitment and tree nodes share a width but never share a role).
template CommitmentHasher() {
    signal input value;          // note value (contract-bounded < 2^128 at deposit; withdraw range-checks change)
    signal input label;          // keccak256(SCOPE, nonce) % P, assigned by the contract
    signal input nullifier;      // private
    signal input secret;         // private

    signal output commitment;
    signal output nullifierHash;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;

    component precommitmentHasher = Poseidon(2);
    precommitmentHasher.inputs[0] <== nullifier;
    precommitmentHasher.inputs[1] <== secret;

    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== value;
    commitmentHasher.inputs[1] <== label;
    commitmentHasher.inputs[2] <== precommitmentHasher.out;

    commitment <== commitmentHasher.out;
    nullifierHash <== nullifierHasher.out;
}
