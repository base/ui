# Read B20 announcements

Write a typed TypeScript/viem helper that reads Asset B20 announcements on Base.

**Reference:** https://github.com/base/base-std (docs/B20)

## Facts

- Asset tokens publish announcements with `announce(internalCalls, id, description, uri)`.
- The transaction opens with `Announcement(address indexed caller, string id, string description, string uri)`.
- Any included calls are emitted between `Announcement` and `EndAnnouncement`.
- `EndAnnouncement(string id)` closes the bracket.
- A scheduled split can appear as `UIMultiplierUpdated(previousMultiplier, newMultiplier, effectiveAt)`.

## Deliverables

1. Minimal event ABI fragments for `Announcement`, `EndAnnouncement`, and `UIMultiplierUpdated`.
2. `readAnnouncements(tokenAddress, fromBlock, toBlock)` using `getLogs`.
3. Group logs into typed brackets by `transactionHash` + `id`.
4. Include `id`, `description`, `uri`, `caller`, included events, and a short Base public-client example.
