// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Block Runner's onchain high-score board (vibenet devnet).
/// No names — a score belongs to the wallet that submitted it, and only a
/// wallet's best is kept. The top ten live in a fixed array, sorted on write
/// so reading is one call. NOTE: vibenet is regenesised periodically; when
/// that happens, redeploy with deploy.mjs and update the address constant in
/// ../lib/leaderboard.ts.
contract BlockRunnerScores {
    struct Entry {
        address player;
        uint96 score;
    }

    Entry[10] public board;
    mapping(address => uint96) public best;

    event NewScore(address indexed player, uint96 score);

    function submit(uint96 score) external {
        require(score > 0, "zero score");
        require(score > best[msg.sender], "not your best");
        best[msg.sender] = score;
        emit NewScore(msg.sender, score);

        // Find the sender's existing slot, or take the last one if they beat it.
        uint256 idx = 10;
        for (uint256 i = 0; i < 10; i++) {
            if (board[i].player == msg.sender) {
                idx = i;
                break;
            }
        }
        if (idx == 10) {
            if (board[9].player != address(0) && score <= board[9].score) return;
            idx = 9;
        }
        board[idx] = Entry(msg.sender, score);
        while (idx > 0 && board[idx].score > board[idx - 1].score) {
            Entry memory t = board[idx - 1];
            board[idx - 1] = board[idx];
            board[idx] = t;
            idx--;
        }
    }

    function top() external view returns (Entry[10] memory) {
        return board;
    }
}
