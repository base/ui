import { type NextRequest, NextResponse } from "next/server";
import { type BundleEvent, getBundleHistory } from "@/lib/s3";

export interface BundleHistoryResponse {
  hash: string;
  history: BundleEvent[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await params;

    const bundle = await getBundleHistory(hash);
    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const history = bundle.history;
    history.sort((lhs, rhs) =>
      lhs.data.timestamp < rhs.data.timestamp ? -1 : 1,
    );

    const response: BundleHistoryResponse = {
      hash,
      history: bundle.history,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching bundle data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
