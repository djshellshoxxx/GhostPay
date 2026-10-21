// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title PoolConstants
/// @notice Constants shared by the shielded pool contracts (spec section 6.1).
library PoolConstants {
    /// @notice bn254 scalar field modulus P (equals the `r` constant of snarkjs verifiers).
    uint256 internal constant SNARK_SCALAR_FIELD =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    /// @notice Number of most recent state roots a proof may reference.
    uint256 internal constant ROOT_HISTORY_SIZE = 64;
    /// @notice Largest tree depth (circuit parameter `Withdraw(32)`).
    uint256 internal constant MAX_TREE_DEPTH = 32;
    /// @notice Largest note value (`Num2Bits(128)` range in the circuit).
    uint256 internal constant MAX_VALUE = type(uint128).max;
    /// @notice Largest relayer-fee cap a deployment may choose, in basis points.
    uint256 internal constant MAX_RELAYER_FEE_BPS_LIMIT = 1000;
    /// @notice Basis-point denominator.
    uint256 internal constant BPS = 10_000;
    /// @notice Largest ASP grace period a deployment may choose.
    uint256 internal constant MAX_ASP_GRACE = 1 days;
    /// @notice ERC-5564 scheme id of every pool announcement (secp256k1 with view tags).
    uint256 internal constant SCHEME_ID = 1;
    /// @notice Poseidon(1, 2), circomlib reference value; constructor known-answer test of `POSEIDON_T3`.
    uint256 internal constant POSEIDON_T3_KAT =
        7_853_200_120_776_062_878_684_798_364_095_072_458_815_029_376_092_732_009_249_414_926_327_459_813_530;
    /// @notice Poseidon(1, 2, 3), circomlib reference value; known-answer test of `POSEIDON_T4`.
    uint256 internal constant POSEIDON_T4_KAT =
        6_542_985_608_222_806_190_361_240_322_586_112_750_744_169_038_454_362_455_181_422_643_027_100_751_666;

    /// @notice Returns true iff the current chain is anvil (31337), Sepolia (11155111) or Base Sepolia (84532).
    /// @return True on an allowed testnet.
    function isAllowedChain() internal view returns (bool) {
        return block.chainid == 31_337 || block.chainid == 11_155_111 || block.chainid == 84_532;
    }
}
