import babelParser from "@babel/eslint-parser"
import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import turboPlugin from "eslint-plugin-turbo"

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript checks these, including symbols used only as types or JSX.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          parserOpts: { plugins: ["typescript", "jsx"] },
        },
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    ignores: ["dist/**"],
  },
]
