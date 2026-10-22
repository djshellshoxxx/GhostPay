// SPDX-License-Identifier: GPL-3.0
// INSECURE DEV CEREMONY: keys built for this circuit by scripts/ceremony-dev.sh are forgeable. Testnet only.
// Ragequit circuit: public [commitment, nullifierHash, value, label].
pragma circom 2.2.0;

include "../commitment.circom";

component main {public [value, label]} = CommitmentHasher();
