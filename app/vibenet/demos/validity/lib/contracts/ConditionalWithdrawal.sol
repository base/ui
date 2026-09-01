// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Permissionless condition switch backed by one stable storage word.
contract ConditionalWithdrawal {
    /// @dev Stable forever: keccak256("vibenet.validity.conditional-withdrawal.enabled.v1").
    bytes32 public constant ENABLED_SLOT =
        0xa91a9aee734204743335c443df931dcb220441d8aa6c1355dc61503a4bec3129;
    uint256 public constant WITHDRAWAL_AMOUNT = 1 ether;

    IERC20 public immutable VIBE;

    constructor(IERC20 vibe) {
        VIBE = vibe;
    }

    function enabled() public view returns (bool value) {
        bytes32 slot = ENABLED_SLOT;
        assembly {
            value := iszero(iszero(sload(slot)))
        }
    }

    function setEnabled(bool value) external {
        bytes32 slot = ENABLED_SLOT;
        assembly {
            sstore(slot, value)
        }
    }

    function flip() external returns (bool value) {
        bytes32 slot = ENABLED_SLOT;
        assembly {
            value := iszero(sload(slot))
            sstore(slot, value)
        }
    }

    function withdraw() external {
        require(enabled(), "withdrawal disabled");
        require(VIBE.transfer(msg.sender, WITHDRAWAL_AMOUNT), "transfer failed");
    }
}
