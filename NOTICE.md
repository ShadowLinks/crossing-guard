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
  two months old at the time this was written, with thin public documentation. *Update (2026-08-14):* real
  testing against it turned up and fixed a wrong field shape (using Google's own how-to guide), and then - after
  an incorrect intermediate conclusion that Gmail DLP rules couldn't block mail at all, based on one Admin
  console screenshot that happened to omit the option - a real rule read back from this district's own tenant
  confirmed the actual block action shape: `action.gmailAction.blockContent.actionParams` with
  `applyInternalMessages` / `applyExternalMessages` booleans, combined with the send/receive trigger to express
  a direction. That's a real, confirmed shape, not a guess. The one remaining guess is the CEL condition sent
  when there's no content to match on (`condition.contentCondition: "true"`) - a plausible, syntactically valid
  "match everything" expression, chosen specifically because guessing wrong there fails loudly (Google rejects
  bad CEL with a 400) rather than silently creating a broader rule than intended. If that call fails for any
  reason, the app automatically falls back to the guided manual/deep-link flow rather than leaving you stuck.
  The Drive trust rule has no write API at all and always goes through the manual flow. See the comment at the
  top of `server/src/services/policyService.ts` for the full detail.
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
domain, and confirm the resulting Gmail/Drive settings in the Admin console match what you expected. If you
turn on `ENABLE_LIVE_DLP_API`, do that testing with the flag on: create a rule against a throwaway OU for each
of the three directions, and check each resulting rule in Admin console (Security &rarr; Data protection &rarr;
Rules) shows the block action and internal/external scope you expected before trusting it on a real OU.
