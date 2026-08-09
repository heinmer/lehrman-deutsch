import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * The rule this configuration exists for is `react-hooks/exhaustive-deps`.
 * `useNarration` deliberately re-creates its audio element on one dependency
 * and reads the rest, and that decision is only safe while something checks
 * that it is still the *only* place doing it — the disable comment above it
 * was inert for as long as there was no linter to disable anything.
 *
 * Type-aware rules are on: most of what is worth catching here (a floating
 * promise from `audio.play()`, a `void` swallowing an error) needs types.
 */
export default tseslint.config(
  {
    ignores: ["dist", "public/data", "public/media", ".cache"],
  },

  // The app: browser globals, React rules, type-aware linting.
  {
    files: ["src/**/*.{ts,tsx}", "shared/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // The plugin still ships its presets in the old shape, so the rules are
    // spread in by hand rather than extended.
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The codebase writes `void promise` where it means "not awaited on
      // purpose"; that is the documented escape hatch for this rule.
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
    },
  },

  // The pipeline and its tests: Node globals, no React.
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts", "shared/**/*.ts", "vite.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ["./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // `node:test` returns a promise from every `test()` call and expects it to be
  // left alone; the runner is what awaits them.
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },

  // This file describes the linter; it is not linted with the project's types.
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
