---
name: addfox-testing
version: 0.1.1
description: Test Addfox extensions with Rstest for unit/component tests and Playwright for end-to-end extension loading.
metadata:
  tags: addfox, testing, rstest, playwright, e2e, unit-test, browser-extension
---

# Addfox Testing

Use this skill to implement automated testing for Addfox extensions.

## When to use

- Creating unit tests for extension logic and utilities
- Mocking `chrome.*` or `browser.*` APIs
- Adding Playwright E2E tests for popup/content/background flows
- Running extension tests in CI

## Test strategy

| Layer | Tool | Purpose |
|---|---|---|
| Unit | Rstest | Business logic, storage, messaging handlers |
| Component | Rstest + jsdom/happy-dom | UI rendering and interaction |
| E2E | Playwright | Real extension loading and user flows |

## Minimum setup

- Add Rstest config and setup file for API mocks.
- Build extension before E2E (`addfox build`).
- Launch browser context with extension from `.addfox/extension`.

## Best practices

- Keep unit tests fast and isolated.
- Use E2E for critical cross-context flows.
- Run test matrix on Chromium + Firefox when applicable.
