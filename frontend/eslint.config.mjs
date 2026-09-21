import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** Native flat config — no FlatCompat/legacy-eslintrc conversion needed,
 * since eslint-config-next ships flat-config-shaped exports directly from
 * v16 on. */
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
