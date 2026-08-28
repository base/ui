# Read a B20 token policy

Write a typed TypeScript/viem helper that reads B20 policy configuration on Base.

**Reference:** https://github.com/base/base-std (docs/B20 and docs/PolicyRegistry)

## Facts

- Policy Registry: `0x8453000000000000000000000000000000000002`
- `token.policyId(bytes32 scope)` returns `uint64`; scope = `keccak256(scope name)`.
- Scopes: `TRANSFER_SENDER_POLICY`, `TRANSFER_RECEIVER_POLICY`, `TRANSFER_EXECUTOR_POLICY`, `MINT_RECEIVER_POLICY`.
- Registry reads: `policyExists(uint64)`, `policyAdmin(uint64)`, `isAuthorized(uint64, address)`.
- Policy id `0` means no policy / wide open.

## Deliverables

1. Minimal ABI fragments only.
2. `readTokenPolicies(tokenAddress)` with exists/admin per scope.
3. `isAuthorized(tokenAddress, scope, account)`.
4. Typed results plus a short Base public-client example.
