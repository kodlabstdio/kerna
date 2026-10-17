# Testing conventions

Write tests that synchronize on behavior, not elapsed guesses. These conventions apply to tests, fixtures and browser checks, including changes to existing tests.

## Test behavior at the smallest useful boundary

Unit and adapter tests are the default. Exercise production behavior through its public entry point and assert observable results: accepted or rejected Pages, responses, retained edits, revisions and cleanup. Avoid assertions about private helper calls or incidental markup unless that interaction is the contract. Prefer regressions for consequential behavior over tests that repeat an implementation or a one-time visual inspection.

Mock HTTP and storage dependencies in these tests. Do not open listening sockets, start Astro, connect to SQLite or call external services merely to arrange an input or return a result. Use real `Request` and `Response` objects in memory, controllable fetch results and small storage doubles. Reset mocks between tests. Keep real domain validation and the behavior under test; mocking those would only test the mock. Existing examples are the [plugin hook tests](packages/plugin/tests/plugin.test.ts), [render budget tests](packages/plugin/tests/render.test.ts) and [editor adapter tests](apps/playground/tests/editor-adapter.test.mjs).

Keep a small integration layer for contracts a double cannot establish: native permission enforcement, atomic revision conflicts, compiled Astro output and installed package assets. State that boundary beside the test. Use disposable local data and loopback requests; never use a developer database or external service. Do not repeat the full behavior matrix through a real host when unit or adapter tests can cover the permutations.

Tests and core coverage remain required in GitHub Actions. Local readiness checks supplement that gate. On constrained runners, keep native hosts and builds serial, fail on the first test failure, cancel superseded workflow runs and measure setup, build and test time before optimizing. Reduce repeated work before adding workers, increasing deadlines or buying larger runners.

## Choose the synchronization mechanism

| What the test needs                                                                 | Use                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A debounce, retry interval, animation timer or timeout owned by the code under test | Fake timers and explicit clock advancement                                |
| Completion of an asynchronous operation                                             | Its returned Promise, event or a controllable deferred Promise            |
| State produced by a real host or browser                                            | An awaited, bounded condition assertion that stops as soon as it succeeds |
| Host startup, process shutdown or a production build                                | A readiness signal or process exit, with a failure deadline               |

Do not use fixed sleeps, `waitForTimeout`, busy loops or `setTimeout(resolve, delay)` to wait for UI, history, requests or fixture readiness. A zero-delay sleep or an arbitrary chain of microtask flushes is not a substitute for observing completion. Do not fix a flaky test by increasing its delay, adding retries or weakening its assertion.

## Control time in timer tests

Import test APIs from `vite-plus/test`. Enable `vi.useFakeTimers()` before scheduling the work, advance only the time needed with `await vi.advanceTimersByTimeAsync(...)`, and restore real timers in cleanup even when an assertion fails. Assert the relevant state before and after the timer boundary. Avoid running every pending timer when intervals or unrelated timers can be present.

For React, wrap rendering, interactions and clock advancement that trigger updates in awaited `act(...)`. Fake timers control the clock; `act` settles the resulting React updates. They serve different purposes. Scope fake timers to the test; they do not advance clocks inside a separately running Astro host.

The [render budget tests](packages/plugin/tests/render.test.ts) demonstrate controlled time and explicit deferred work. Preserve their checks that a timeout ends the response while actual render slots remain occupied until the work settles.

## Await observable completion

Await the operation directly when its API exposes completion. For races and cancellation, use deferred Promises to control when individual operations resolve or reject, then assert the resulting state. Do not add a production-only testing API just to avoid choosing an existing observable boundary.

When an external system exposes state but no completion event, use an awaited `expect.poll` with an explicit timeout and a useful failure message, or the browser tool's condition-based wait. Poll a read-only observation; perform clicks, writes and other mutations once outside the polling callback. Bound network requests as well as the overall wait. Do not use a polling assertion for a debounce whose clock the test can control.

For a negative assertion such as “no stale response was accepted,” first settle the relevant work or advance beyond the relevant timer boundary. An immediate “not called” assertion alone does not prove that nothing arrives later.

## Keep real-host checks focused

Cover timing and race permutations in deterministic unit or adapter tests. Use native-host and packed-package tests for integration behavior that those tests cannot prove: real authorization, revision conflicts, compiled Astro output, installed exports and assets.

Render deadlines, occupied slots and output limits belong in the controlled-clock [render tests](packages/plugin/tests/render.test.ts); the [admission tests](packages/plugin/tests/astro.test.ts) verify that the actual preview path applies that wrapper. Native hosts verify compiled rendering and assets in development and production. Do not burn CPU or wait through the production deadline in each host merely to repeat the wrapper's behavior matrix. These tests do not benchmark trusted Component execution or establish that synchronous work can be interrupted.

Reuse equivalent builds and host setup where it measurably saves time. Keep mutable content, sessions and render state isolated or explicitly reset between cases. Tests must pass independently and in a different order. Register fixture cleanup before starting asynchronous work, and stop owned processes on failure as well as success.

Real elapsed time is allowed only when it is the behavior being verified, such as a native HTTP deadline, and a controlled clock cannot prove that integration. Document the exception beside the test with `Real-time contract:`, the invariant, why real time is required and its maximum expected duration. A fixture may deliberately delay or block to exercise that contract; it must not use that delay to synchronize the test. Keep the smallest necessary real-time case and cover permutations with controlled clocks. Do not shorten the production deadline, change frozen acceptance criteria or remove distinct host coverage merely to make a test faster; agree on such scope changes first.

## Review and verification

- Check changed tests and their helpers for fixed sleeps, timer leaks and unawaited asynchronous assertions.
- Verify behavior at the relevant boundary, including stale, cancelled or late work where applicable.
- For performance changes, record before/after duration for the same command and environment, plus the assertions and integration coverage preserved. Distinguish local measurements from GitHub runner measurements.
- Run the affected tests first. Use `vp run test:ci` for the complete test gate and `vp run ready` for full readiness. Preserve fail-fast behavior, cleanup and the core coverage threshold.
- Treat a sleep search as a review aid, not proof of compliance: deadline guards, fake-clock advancement and a documented real-time fixture have different purposes.

The conventions use [Vitest request mocking](https://main.vitest.dev/guide/mocking/requests), [fake timers](https://main.vitest.dev/guide/mocking/timers), [bounded polling assertions](https://main.vitest.dev/api/expect#poll) and [React's asynchronous `act`](https://react.dev/reference/react/act).
