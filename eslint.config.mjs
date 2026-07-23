import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "react-hooks": reactHooks,
      import: importPlugin,
    },
    rules: {
      // React Hooks rules
      ...reactHooks.configs.recommended.rules,
      // Import sorting
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
          alphabetize: { order: "asc" },
        },
      ],
      // No unused variables (including catch error unused)
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "all", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    ".vinext/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    ".wrangler/**",
    "work/**",
    ".npm-cache/**",
  ]),
]);

export default eslintConfig;
