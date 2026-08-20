import {
  decodeSearchParamState,
  encodeSearchParamState,
} from "./useSearchParamsState";

describe("search param state codec", () => {
  it("round trips unicode values through base64 JSON", () => {
    const value = {
      label: "Ethereum - Base — Sepolia",
      params: {
        quote: "smart “wallet”",
      },
    };

    expect(decodeSearchParamState(encodeSearchParamState(value))).toEqual(value);
  });
});
