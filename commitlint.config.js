export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        // packages and apps
        "core",
        "components",
        "plugin",
        "agent",
        "playground",
        "site",
        "docs",
        // repo-wide work
        "repo",
        "ci",
        "deps",
        "adr",
        "tasks",
      ],
    ],
  },
};
