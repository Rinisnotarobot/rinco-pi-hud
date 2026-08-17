import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: ["node_modules/**"],
	},
	{
		files: ["extensions/**/*.ts", "tests/**/*.ts"],
		extends: [eslint.configs.recommended, tseslint.configs.recommended, eslintConfigPrettier],
		rules: {
			"no-console": "warn",
			"no-control-regex": "off",
			"no-empty": "off",
			"no-undef": "off",
			"no-useless-assignment": "off",
			"preserve-caught-error": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
			],
		},
	},
);
