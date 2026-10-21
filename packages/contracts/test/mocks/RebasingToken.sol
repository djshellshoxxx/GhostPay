// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title RebasingToken
/// @notice Shares-based ERC-20 in the style of stETH/AMPL: balances are `shares * index / 1e18`, `rebase` changes
/// every holder's balance without a transfer, and transfers move whole shares (rounded up), so a receiver can
/// gain more or less than the nominal amount once `index != 1e18`. With `rebaseOnTransfer` the index also moves
/// by +1% inside every transfer (balances change while a router is measuring them). Tests only.
contract RebasingToken is IERC20 {
    string public constant name = "Rebasing";
    string public constant symbol = "REB";
    uint8 public constant decimals = 18;
    uint256 public constant UNIT = 1e18;

    /// @notice Balance multiplier, 1e18 = 1.0.
    uint256 public index = UNIT;
    /// @notice When true every transfer raises `index` by 1% after moving shares.
    bool public rebaseOnTransfer;
    /// @notice Shares per holder.
    mapping(address => uint256) public sharesOf;
    /// @notice Total shares.
    uint256 public totalShares;

    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Set the rebase index (positive or negative rebase).
    /// @param newIndex New index, 1e18 = 1.0; must be non-zero.
    function rebase(uint256 newIndex) external {
        require(newIndex != 0, "zero index");
        index = newIndex;
    }

    /// @notice Toggle the rebase-inside-transfer behaviour.
    /// @param on Whether transfers raise the index by 1%.
    function setRebaseOnTransfer(bool on) external {
        rebaseOnTransfer = on;
    }

    /// @notice Mint tokens worth `amount` at the current index.
    /// @param to Recipient.
    /// @param amount Balance to credit (rounded up to whole shares).
    function mint(address to, uint256 amount) external {
        uint256 sh = _toShares(amount);
        sharesOf[to] += sh;
        totalShares += sh;
        emit Transfer(address(0), to, amount);
    }

    /// @inheritdoc IERC20
    function totalSupply() external view returns (uint256) {
        return totalShares * index / UNIT;
    }

    /// @inheritdoc IERC20
    function balanceOf(address a) public view returns (uint256) {
        return sharesOf[a] * index / UNIT;
    }

    /// @inheritdoc IERC20
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /// @inheritdoc IERC20
    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    /// @inheritdoc IERC20
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "allowance");
            allowance[from][msg.sender] = a - value;
        }
        _move(from, to, value);
        return true;
    }

    function _toShares(uint256 amount) internal view returns (uint256) {
        return (amount * UNIT + index - 1) / index;
    }

    function _move(address from, address to, uint256 value) internal {
        uint256 sh = _toShares(value);
        require(sharesOf[from] >= sh, "balance");
        sharesOf[from] -= sh;
        sharesOf[to] += sh;
        if (rebaseOnTransfer) index = index * 101 / 100;
        emit Transfer(from, to, value);
    }
}
