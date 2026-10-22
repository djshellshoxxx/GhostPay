// SPDX-License-Identifier: GPL-3.0
// INSECURE DEV CEREMONY: keys built for this circuit by scripts/ceremony-dev.sh are forgeable. Testnet only.
pragma circom 2.2.0;

include "../withdraw.circom";

component main {public [withdrawnValue, stateRoot, stateTreeDepth, aspEnabled, ASPRoot, ASPTreeDepth, context]} = Withdraw(32);
