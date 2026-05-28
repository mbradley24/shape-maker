import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["dist", "node_modules", "src-tauri/target"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        document: "readonly",
        window: "readonly",
        Blob: "readonly",
        URL: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLInputElement: "readonly",
        KeyboardEvent: "readonly",
        PointerEvent: "readonly",
        DragEvent: "readonly",
        Event: "readonly",
        FileReader: "readonly",
        ResizeObserver: "readonly",
        alert: "readonly",
        prompt: "readonly",
        crypto: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  prettier,
];
