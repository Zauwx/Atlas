import eslintConfigPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"],
  },
  // Package sources: full type-checked linting.
  {
    files: ["packages/*/src/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importX,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: ["packages/*/tsconfig.json"],
        },
      },
    },
    rules: {
      // CLAUDE.md absolutes, enforced mechanically.
      "@typescript-eslint/no-explicit-any": "error",
      "import-x/no-cycle": "error",
    },
  },
  // Tooling configs: syntax-only linting, no type information required.
  {
    files: ["*.config.ts", "*.config.js", "eslint.config.js", "packages/*/*.config.ts"],
    extends: [...tseslint.configs.recommended],
  },
  eslintConfigPrettier,
);
