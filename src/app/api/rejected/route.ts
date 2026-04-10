import { NextResponse } from "next/server";
import {
  getRejectedTransaction,
  listRejectedTransactions,
  type RejectedTransaction,
} from "@/lib/s3";

export interface RejectedTransactionsResponse {
  transactions: RejectedTransaction[];
}

export async function GET() {
  try {
    const summaries = await listRejectedTransactions(100);

    const transactions = (
      await Promise.all(
        summaries.map((s) => getRejectedTransaction(s.blockNumber, s.txHash)),
      )
    ).filter((tx): tx is RejectedTransaction => tx !== null);

    const response: RejectedTransactionsResponse = { transactions };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching rejected transactions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
