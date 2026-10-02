import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
    // 1. Files & Directories to Ignore
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "src/generated/**",
            "generated/**",
            "*.config.js",
            "*.config.mjs",
        ],
    },

    // 2. Base Recommended JavaScript Rules
    js.configs.recommended,

    // 3. Recommended TypeScript Rules
    ...tseslint.configs.recommended,

    // 4. Custom Project Rules for Clean Architecture & Security
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
            },
        },
        rules: {
            // ── Clean Code & Type Safety ──────────────────────────────
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports", fixStyle: "inline-type-imports" },
            ],
            "@typescript-eslint/no-non-null-assertion": "warn",

            // ── General Best Practices ───────────────────────────────
            "no-console": ["warn", { allow: ["warn", "error", "info", "trace"] }],
            "no-return-await": "off",
            "no-process-exit": "warn",
            "prefer-const": "error",
            "eqeqeq": ["error", "always", { null: "ignore" }],
        },
    },

    // 5. Disable ESLint rules that might conflict with Prettier
    prettierConfig,
);