// F-ESLINT (Milestone 1, Batch 5): migration from FlatCompat (crashed
// on Next 16's native flat config) to direct import of Next's flat
// exports.
//
// IMPORTANT: `eslint-config-next/core-web-vitals` does NOT include the
// `@typescript-eslint` plugin. That lives in `eslint-config-next/typescript`.
// If you reference `@typescript-eslint/*` rules without importing
// `nextTs`, ESLint errors with:
//   "A configuration object specifies rule '@typescript-eslint/...'
//    but could not find plugin '@typescript-eslint'"
//
// Rule severity rationale:
//   - `rules-of-hooks` and `set-state-in-render` stay at `error` —
//     they catch real bugs.
//   - `set-state-in-effect` and `preserve-manual-memoization` are NEW
//     opinionated React 19 Compiler rules. They flag patterns (seeding
//     state from fetched data, syncing URL state) used throughout the
//     codebase. Downgraded to `warn` — they're performance hints, not
//     correctness rules. Fix incrementally.
//   - Unused vars is `error` (clean code matters) with `_` prefix
//     escape for intentionally-unused args.

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,

  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },

  {
    rules: {
      // --- React Hooks ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- React 19 Compiler: correctness (stay error) ---
      "react-hooks/set-state-in-render": "error",

      // --- React 19 Compiler: opinionated perf hints (downgrade to warn) ---
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",

      // --- TypeScript ---
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // --- Next.js ---
      "@next/next/no-location-assign-relative-destination": "warn",

      // --- Misc ---
      "react/no-unescaped-entities": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];

export default config;