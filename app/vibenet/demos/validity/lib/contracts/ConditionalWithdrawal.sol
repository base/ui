// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Permissionless VIBE withdrawal controlled by a boolean condition.
contract ConditionalWithdrawal {
    uint256 public constant WITHDRAWAL_AMOUNT = 1 ether;

    IERC20 public immutable VIBE;
    bool public enabled;

    constructor(IERC20 vibe) {
        VIBE = vibe;
    }

    function setEnabled(bool value) external {
        enabled = value;
    }

    function withdraw() external {
        require(enabled, "withdrawal disabled");
        require(VIBE.transfer(msg.sender, WITHDRAWAL_AMOUNT), "transfer failed");
    }
}
