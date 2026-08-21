"use strict";

module.exports = [
  {
    files: [
      "public/utils/consultation-form.js",
      "public/utils/lesson-region-modal.js",
      "netlify/functions/consultation-email.js",
      "scripts/test-consultation-email.js",
      "scripts/test-lesson-region-modal.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        global: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
];
