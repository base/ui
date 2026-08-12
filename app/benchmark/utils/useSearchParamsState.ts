import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Hook for storing state in URL search parameters as base64 encoded JSON
 * Supports multiple instances without conflicts
 * @param paramName The name of the search parameter
 * @param defaultValue The default value to use if the parameter is not present
 * @returns A tuple containing the state value and a setter function
 *
 * Ported from the react-router version in base/benchmark — same base64-JSON
 * encoding, driven by next/navigation instead. Components using this need a
 * Suspense boundary above them: useSearchParams() opts the subtree out of
 * static prerendering.
 */
export function useSearchParamsState<T>(
  paramName: string,
  defaultValue: T,
): [T, (value: T | ((prevValue: T) => T)) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Initialize from URL or default
  const [state, setState] = useState<T>(() => {
    const paramValue = searchParams.get(paramName);
    if (paramValue) {
      try {
        // Decode base64 back to JSON string and then parse
        const jsonString = atob(paramValue);
        return JSON.parse(jsonString) as T;
      } catch (e) {
        console.error(
          `Error parsing state from URL parameter ${paramName}:`,
          e,
        );
        return defaultValue;
      }
    }

    return defaultValue;
  });

  // Custom setter that updates both state and URL
  const setStateWithSearchParams = useCallback(
    (value: T | ((prevValue: T) => T)) => {
      setState((prev) => {
        const newValue =
          typeof value === "function" ? (value as (prev: T) => T)(prev) : value;

        // Update the URL immediately, keeping all other parameters. `replace`
        // keeps filter churn out of the back-button history, matching the
        // react-router original's `{ replace: true }`.
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set(paramName, btoa(JSON.stringify(newValue)));
        router.replace(`${pathname}?${newParams.toString()}`, {
          scroll: false,
        });

        return newValue;
      });
    },
    [paramName, pathname, router, searchParams],
  );

  return [state, setStateWithSearchParams];
}
