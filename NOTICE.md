# AI-generated code notice

This project — the Express/TypeScript backend, the React frontend, the nginx/systemd deployment files, and
`README.md`/`SETUP.md` — was written by an AI coding assistant (Claude, via Claude Code / Cowork) at the
request of district IT staff, based on a description of the desired app and a round of
research into Google Workspace's public APIs.

## What was verified before delivery

- The TypeScript in both `server/` and `client/` type-checks cleanly (`npm run typecheck`).
- The production build succeeds (`npm run build`) and the compiled server boots, serves the frontend, responds
  to `/healthz`, starts the OAuth redirect flow, and exposes the session API — all checked with a throwaway
  `.env` and dummy Google credentials in a sandboxed environment.
- The two Admin console links baked into the app (`https://admin.google.com/ac/apps/gmail/compliance` and
  `https://admin.google.com/ac/ax`) were cross-checked against Google's own published help center articles,
  not guessed.
- The claim that classic Gmail "Content compliance" rules and Drive "Trust rules" have no write API, and that
  Google's Cloud Identity Policy API gained DLP mutate support in June 2026, was verified against Google's own
  settings documentation and Workspace Updates blog at the time this was written.

## What was NOT verified before delivery — since confirmed or updated after real-world testing

- **No live Google Workspace tenant was available during development.** This app's OAuth flow, admin-role
  check, and OU browsing were only type-checked and boot-tested in a sandbox before delivery, not exercised
  against a real domain. *Update:* the district has since signed in against a real tenant and successfully
  reached the rule wizards, which exercises the OAuth flow, the admin-role check, and OU-tree browsing against
  real data - those three pieces are now confirmed working, not just type-checked.
- **The optional live DLP rule creation path** (`ENABLE_LIVE_DLP_API=true`) calls a Google API that was roughly
  two months old at the time this was written, with thin public documentation. *Update:* real testing against
  it turned up a bug (a wrong field shape) that has since been fixed and confirmed against Google's own
  how-to guide, along with several other envelope fields. However, the part of the request that would actually
  filter by sender/recipient domain and block a Gmail message has no published schema anywhere Google has
  written, and guessing it risks a rule silently broader than intended rather than a safe failure - so this
  path now deliberately refuses to send a request at all, explaining why, until that piece is confirmed (see
  the comment at the top of `server/src/services/policyService.ts`). Both rule types go through the guided
  manual/deep-link flow today, which is accurate and doesn't depend on any of this.
- No independent security review or penetration test has been performed. The session handling, admin-role
  gate, and OAuth flow follow standard, well-established patterns, but "written by AI following best
  practices" is not a substitute for your own security review before this touches a production identity
  system.
- No automated test suite exists yet (no Jest/Vitest tests were written). Verification so far is limited to
  type-checking, a production build, a smoke test of server startup/routing, and the real-world testing noted
  above.

## Recommendation

Before using this for real compliance changes: read through the code (it's a small, readable codebase — see
the "Project layout" section in `README.md`), test both wizards against a low-stakes test OU in your own
domain, and confirm the resulting Gmail/Drive settings in the Admin console match what you expected. For the
Gmail wizard specifically, that means using the manual/deep-link flow it hands you today - the live path is
intentionally not wired up yet, for the reason above.
