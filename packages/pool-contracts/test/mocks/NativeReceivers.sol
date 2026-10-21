// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title RevertingReceiver
/// @notice Contract that rejects every native transfer (tests only).
contract RevertingReceiver {
    /// @notice Always reverts.
    receive() external payable {
        revert("no ETH");
    }
}

/// @title ReentrantReceiver
/// @notice Contract that tries to call back into a target when it receives native value (tests only).
contract ReentrantReceiver {
    /// @notice Target to call back.
    address public target;
    /// @notice Calldata to send on receipt.
    bytes public data;
    /// @notice Value to forward with the callback.
    uint256 public callbackValue;
    /// @notice Whether a failing callback reverts the transfer.
    bool public bubble;
    /// @notice Result of the last callback.
    bool public lastSuccess;
    /// @notice Number of callbacks attempted.
    uint256 public attempts;

    /// @notice Arm the callback.
    /// @param target_ Contract to call.
    /// @param data_ Calldata.
    /// @param value_ Native value forwarded with the callback (taken from this contract's balance).
    /// @param bubble_ Revert when the callback fails.
    function arm(address target_, bytes calldata data_, uint256 value_, bool bubble_) external {
        target = target_;
        data = data_;
        callbackValue = value_;
        bubble = bubble_;
    }

    /// @notice Accepts value and calls back once.
    receive() external payable {
        if (target != address(0)) {
            address t = target;
            target = address(0);
            attempts++;
            (bool ok,) = t.call{value: callbackValue}(data);
            lastSuccess = ok;
            if (!ok && bubble) revert("reentry failed");
        }
    }
}

/// @title GasBurnReceiver
/// @notice Contract that burns all gas it is given when it receives native value (tests only).
contract GasBurnReceiver {
    /// @notice Loops until out of gas.
    receive() external payable {
        while (true) {}
    }
}
