# Integrate Maximum TypeScript Strictness and Linting Toolchain

⸻

Author: Adam Manuel
Date: July 27, 2025
Status: Draft
Priority: High

⸻

🧩 Objective

To enforce the highest level of type safety, code quality, and runtime reliability in the existing TypeScript project by integrating an advanced static analysis, linting, and runtime validation toolchain.

This upgrade should:
	•	Catch more bugs during development.
	•	Enforce consistency and maintainability across the team.
	•	Improve developer confidence and CI robustness.

⸻

🧪 Scope

This PRD introduces the following tooling and configuration:

1. Strict TypeScript Compiler Settings
	•	Enable all strict flags in tsconfig.json
	•	Enforce exactOptionalPropertyTypes, noUncheckedIndexedAccess, and useUnknownInCatchVariables

2. ESLint Setup
	•	Use @typescript-eslint with type-aware rules
	•	Include:
	•	eslint-plugin-unicorn
	•	eslint-plugin-import
	•	eslint-plugin-eslint-comments
	•	eslint-plugin-functional
	•	eslint-plugin-total-functions
	•	eslint-plugin-sonarjs
	•	eslint-plugin-tsdoc

3. Prettier Integration
	•	Install prettier and eslint-config-prettier
	•	Enforce Prettier formatting via ESLint

4. Runtime Type Validation
	•	Add zod (or optionally io-ts or runtypes)
	•	Add patterns for validating API payloads or external input

5. Type Coverage
	•	Add type-coverage tool
	•	Enforce 100% typed code

6. Unused Code Detection
	•	Integrate ts-prune for unused exports
	•	Add depcheck for unused dependencies

7. Architecture Hygiene
	•	Add madge to detect circular dependencies
	•	Add tsc-alias if path aliases are used

8. Commit and CI Enforcement
	•	Add husky and lint-staged
	•	GitHub Actions CI for:
	•	Linting
	•	Type checking
	•	Type coverage
	•	ts-prune

⸻

🔧 Implementation Plan

✅ Step 1: Dependencies

yarn add -D \
  typescript \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-unicorn \
  eslint-plugin-import \
  eslint-plugin-eslint-comments \
  eslint-plugin-functional \
  eslint-plugin-total-functions \
  eslint-plugin-sonarjs \
  eslint-plugin-tsdoc \
  eslint-config-prettier \
  prettier \
  type-coverage \
  ts-prune \
  depcheck \
  madge \
  tsc-alias \
  husky \
  lint-staged

✅ Step 2: Configuration Files
	•	tsconfig.json: Enable all strict options
	•	.eslintrc.js: Add all plugins and rules
	•	.prettierrc: Style config
	•	.husky/: Install pre-commit hook to run lint-staged
	•	.lintstagedrc: Run ESLint, Prettier, and tsc --noEmit on staged files

✅ Step 3: Runtime Validators
	•	Add zod or preferred validator
	•	Replace all unsafe runtime assumptions with schema validation

✅ Step 4: GitHub Actions

Create .github/workflows/lint.yml:

name: CI Quality Checks
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: yarn install
      - run: yarn lint
      - run: yarn type-coverage --at-least 100
      - run: yarn prune-check


⸻

📦 Deliverables
	•	Updated tsconfig.json
	•	New .eslintrc.js, .prettierrc, .lintstagedrc
	•	GitHub Action: CI Lint + Type Coverage + Prune
	•	Example use of zod for one validation
	•	Team onboarding docs for new tooling

⸻

🚫 Out of Scope
	•	Migration of old files to zod or equivalent (will be tackled incrementally)
	•	Full removal of all existing technical debt

⸻

📅 Timeline

Task	Owner	Duration	Deadline
Install dependencies	DevOps	0.5 days	July 28
Configure ESLint/Prettier	Dev	1 day	July 29
Integrate runtime validators	Dev	1 day	July 30
Setup CI + lint-staged	DevOps	0.5 days	July 31
QA / Review / Merge	Reviewer	0.5 days	Aug 1


⸻

🧪 Success Criteria
	•	ESLint and Prettier pass on all code
	•	type-coverage returns 100%
	•	ts-prune and depcheck return clean results
	•	CI fails on any regressions
	•	Developer onboarding instructions updated

⸻

Would you like this exported as a .md file or ready-to-commit folder structure?