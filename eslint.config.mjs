import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  {
    extends: [...nextCoreWebVitals],
  },
  {
    // eslint-config-next 16 pulls in eslint-plugin-react-hooks v7, whose
    // recommended preset promotes its new React Compiler diagnostics
    // (set-state-in-effect, refs, purity, immutability, etc.) to errors.
    // Codebase predates React Compiler adoption, so keep these as warnings
    // until each is triaged rather than blocking the build on a dependency bump.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);