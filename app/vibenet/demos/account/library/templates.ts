import { encodeFunctionData, parseAbi } from "@aa";

/** A single staged call in a template (string fields mirror the calls editor). */
export type TemplateCall = { to: string; value: string; data: string };

export type CallTemplate = {
  id: string;
  label: string;
  hint: string;
  /** One line shown in the review summarising the intent. */
  summary: string;
  calls: TemplateCall[];
};

// Placeholder recipient addresses used in demo templates.
const R1 = "0x2222222222222222222222222222222222222222";
const R2 = "0x3333333333333333333333333333333333333333";
const R3 = "0x4444444444444444444444444444444444444444";
// Demo recipient for USDV.
const USDV_RECIPIENT = "0x5555555555555555555555555555555555555555";
// Vibenet devnet USDV contract (deployed by vibenet-setup).
// The `to` field is editable — paste your own address if needed.
const USDV_CONTRACT = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";

const erc20 = parseAbi(["function transfer(address to, uint256 amount)"]);

function call(to: string, data: string, value = "0"): TemplateCall {
  return { to, value, data };
}

export const CALL_TEMPLATES: CallTemplate[] = [
  {
    id: "three-transfers",
    label: "Send 3 transfers",
    hint: "Pay three people at once — atomic batch",
    summary: "Send ETH to 3 recipients (3 calls, atomic)",
    calls: [
      call(R1, "0x", "0.001"),
      call(R2, "0x", "0.002"),
      call(R3, "0x", "0.003"),
    ],
  },
  {
    id: "send-usdv",
    label: "Send USDV",
    hint: "Transfer USDV (vibenet stablecoin) — edit amount or recipient",
    summary: "ERC-20 transfer · 1 USDV → demo recipient",
    calls: [
      call(
        USDV_CONTRACT,
        encodeFunctionData({
          abi: erc20,
          functionName: "transfer",
          // 1 USDV = 1_000_000 units (6 decimals, same as USDC)
          args: [USDV_RECIPIENT, 1_000_000n],
        }),
      ),
    ],
  },
];
