# AI-generated code notice

This project — the Express/TypeScript backend, the React frontend, the nginx/systemd deployment files, and
`README.md`/`SETUP.md` — was written by an AI coding assistant (Claude, via Claude Code / Cowork) at the
request of Loudoun County Public Schools IT staff, based on a description of the desired app and a round of
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

## What was NOT verified — review before trusting in production

- **No live Google Workspace tenant was available during development.** Nobody has signed in through this
  app's OAuth flow against a real Workspace domain, browsed a real OU tree through it, or created a real rule
  with it. The auth flow, admin-role check, and OU browsing use long-stable, well-documented Google APIs, so
  the risk here is low, but "type-checks and boots" is not the same as "works end-to-end against your domain."
- **The optional live DLP rule creation path** (`ENABLE_LIVE_DLP_API=true` in `server/src/services/policyService.ts`)
  calls a Google API that was roughly two months old at the time this was written, with thin public
  documentation. The request payload in that file is a best-effort implementation, not a confirmed-working
  one. It defaults to **off** for exactly this reason. Do not enable it in production without first testing
  against a non-production OU and confirming the resulting rule in the Admin console.
- No independent security review or penetration test has been performed. The session handling, admin-role
  gate, and OAuth flow follow standard, well-established patterns, but "written by AI following best
  practices" is not a substitute for your own security review before this touches a production identity
  system.
- No automated test suite exists yet (no Jest/Vitest tests were written). Verification so far is limited to
  type-checking, a production build, and a smoke test of server startup and routing.

## Recommendation

Before using this for real compliance changes: read through the code (it's a small, readable codebase — see
the "Project layout" section in `README.md`), test both wizards against a low-stakes test OU in your own
domain, and confirm the resulting Gmail/Drive settings in the Admin console match what you expected.
