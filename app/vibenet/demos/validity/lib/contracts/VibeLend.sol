// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

interface IUniswapV2Pair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @notice Demo lending market for the Vibenet validity-transactions demos.
/// Borrowers post VIBE as collateral and borrow USDV. The price oracle is the
/// spot price of the VIBE/USDV Uniswap v2 pair, which anyone can move, so this
/// is not a safe design for real funds.
///
/// A position is liquidatable once `collateral * price * 80% < debt`. Anyone
/// can then call `liquidate(borrower)`: the position is closed, its debt is
/// written off, and the caller receives 5% of the seized collateral.
contract VibeLend {
    /// @dev Packed into one storage word: collateral in the low 128 bits, debt
    /// in the high 128 bits. A validity predicate can pin a position with a
    /// single `=` comparison on `keccak256(abi.encode(borrower, 0))`.
    struct Position {
        uint128 collateral;
        uint128 debt;
    }

    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8_000;
    uint256 public constant LIQUIDATION_REWARD_BPS = 500;
    uint256 private constant BPS = 10_000;
    /// @dev USDV has 6 decimals and VIBE 18, so price(1e18) = usdv * 1e30 / vibe.
    uint256 private constant PRICE_SCALE = 1e30;
    uint256 private constant USDV_TOP_UP = 1_000_000e6;

    /// @dev Slot 0. Keep it first: the UI derives position slots from it.
    mapping(address => Position) public positions;
    address[] private borrowerList;
    mapping(address => bool) private listed;

    IERC20 public immutable VIBE;
    IMintableERC20 public immutable USDV;
    IUniswapV2Pair public immutable PAIR;
    bool public immutable VIBE_IS_TOKEN0;

    event Opened(address indexed borrower, uint256 collateral, uint256 debt);
    event Closed(address indexed borrower, uint256 collateral, uint256 debt);
    event Liquidated(
        address indexed borrower, address indexed liquidator, uint256 collateral, uint256 debt, uint256 reward
    );

    constructor(IERC20 vibe, IMintableERC20 usdv, IUniswapV2Pair pair) {
        VIBE = vibe;
        USDV = usdv;
        PAIR = pair;
        VIBE_IS_TOKEN0 = pair.token0() == address(vibe);
    }

    /// @notice Deposit `collateral` VIBE and borrow `debt` USDV. The position
    /// must be healthy at the current price.
    function open(uint128 collateral, uint128 debt) external {
        require(collateral > 0 && debt > 0, "empty position");
        require(positions[msg.sender].collateral == 0, "position exists");
        (uint256 vibeReserve, uint256 usdvReserve) = reserves();
        require(!_liquidatable(collateral, debt, vibeReserve, usdvReserve), "unhealthy");

        positions[msg.sender] = Position(collateral, debt);
        if (!listed[msg.sender]) {
            listed[msg.sender] = true;
            borrowerList.push(msg.sender);
        }

        require(VIBE.transferFrom(msg.sender, address(this), collateral), "collateral transfer failed");
        // USDV is Vibenet's public-mint test dollar, so the market refills
        // itself instead of relying on a funded treasury.
        if (USDV.balanceOf(address(this)) < debt) USDV.mint(address(this), USDV_TOP_UP);
        require(USDV.transfer(msg.sender, debt), "borrow transfer failed");
        emit Opened(msg.sender, collateral, debt);
    }

    /// @notice Repay the full debt and withdraw the collateral.
    function close() external {
        Position memory position = positions[msg.sender];
        require(position.collateral > 0, "no position");
        delete positions[msg.sender];

        require(USDV.transferFrom(msg.sender, address(this), position.debt), "repay transfer failed");
        require(VIBE.transfer(msg.sender, position.collateral), "collateral transfer failed");
        emit Closed(msg.sender, position.collateral, position.debt);
    }

    /// @notice Close an under-collateralized position and pay the caller 5% of
    /// its collateral.
    function liquidate(address borrower) external returns (uint256 reward) {
        Position memory position = positions[borrower];
        require(position.collateral > 0, "no position");
        (uint256 vibeReserve, uint256 usdvReserve) = reserves();
        require(_liquidatable(position.collateral, position.debt, vibeReserve, usdvReserve), "healthy");
        delete positions[borrower];

        reward = uint256(position.collateral) * LIQUIDATION_REWARD_BPS / BPS;
        require(VIBE.transfer(msg.sender, reward), "reward transfer failed");
        emit Liquidated(borrower, msg.sender, position.collateral, position.debt, reward);
    }

    /// @notice Pair reserves ordered as (VIBE, USDV).
    function reserves() public view returns (uint256 vibeReserve, uint256 usdvReserve) {
        (uint112 reserve0, uint112 reserve1,) = PAIR.getReserves();
        return VIBE_IS_TOKEN0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /// @notice Oracle price in USDV per VIBE, scaled by 1e18.
    function price() external view returns (uint256) {
        (uint256 vibeReserve, uint256 usdvReserve) = reserves();
        return vibeReserve == 0 ? 0 : usdvReserve * PRICE_SCALE / vibeReserve;
    }

    /// @notice `collateral * price * threshold / debt`, scaled by 1e18. Below
    /// 1e18 the position is liquidatable.
    function healthFactor(address borrower) external view returns (uint256) {
        Position memory position = positions[borrower];
        if (position.debt == 0) return type(uint256).max;
        (uint256 vibeReserve, uint256 usdvReserve) = reserves();
        return uint256(position.collateral) * usdvReserve * LIQUIDATION_THRESHOLD_BPS * 1e18
            / (uint256(position.debt) * vibeReserve * BPS);
    }

    function isLiquidatable(address borrower) external view returns (bool) {
        Position memory position = positions[borrower];
        if (position.collateral == 0) return false;
        (uint256 vibeReserve, uint256 usdvReserve) = reserves();
        return _liquidatable(position.collateral, position.debt, vibeReserve, usdvReserve);
    }

    /// @notice Every address that has ever opened a position, with its current
    /// position (zero once closed or liquidated).
    function book() external view returns (address[] memory borrowers, Position[] memory open_) {
        borrowers = borrowerList;
        open_ = new Position[](borrowers.length);
        for (uint256 i = 0; i < borrowers.length; i++) {
            open_[i] = positions[borrowers[i]];
        }
    }

    /// @dev collateral * (usdv / vibe) * threshold < debt, cross-multiplied so
    /// there is no rounding.
    function _liquidatable(uint256 collateral, uint256 debt, uint256 vibeReserve, uint256 usdvReserve)
        private
        pure
        returns (bool)
    {
        return collateral * usdvReserve * LIQUIDATION_THRESHOLD_BPS < debt * vibeReserve * BPS;
    }
}
