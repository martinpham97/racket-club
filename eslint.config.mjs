import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";
import prettier from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,

  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // optional: enable if using type-aware linting

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json"], // required for type-aware linting
      },
    },
  },

  next,
  prettier, // disables rules conflicting with Prettier

  {
    rules: {
      // optional: add your own custom rule overrides here
    },
  },
];
