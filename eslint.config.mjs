import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

/** @type {import("eslint").Linter.Config[]} */
// eslint-disable-next-line import/no-anonymous-default-export
export default [
  js.configs.recommended,

  // Base TypeScript configs
  ...tseslint.configs.recommended,

  // Type-checked TypeScript configs
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...tseslint.configs.recommendedTypeChecked[0],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json", "./convex/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
  },

  // Next.js and Prettier configs
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("prettier"),

  // Custom rules
  {
    rules: {
      "func-style": ["error", "expression"],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_", // ignore unused args starting with _
          varsIgnorePattern: "^_", // ignore unused variables starting with _
          caughtErrorsIgnorePattern: "^_", // ignore unused catch variables starting with _
        },
      ],
    },
  },
];
