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
  two months old at the time this was written, with thin public documentation. *Update (2026-08-14):* every
  field this app sends is now confirmed against this district's real tenant, not guessed - reached via an
  iterative process of creating and reading back real test rules through OAuth Playground (using the app's own
  OAuth scope). Along the way: a wrong field shape was found and fixed against Google's own how-to guide; an
  incorrect intermediate conclusion that Gmail DLP rules couldn't block mail at all (based on one Admin console
  screenshot that happened to omit the option) was corrected after reading back a real block rule; several
  guessed CEL "match everything" conditions (`"true"`, `all_headers.matches('.*')`, `all_headers.contains('')`)
  were each rejected by Google with clear errors (two failed to parse, one parsed but was rejected as an empty
  match) until testing confirmed this API requires a genuine, non-empty content condition; and two fields
  (`ruleTypeMetadata.dlpRuleMetadata.alertSeverity`, `action.alertCenterAction: {}`) turned out to be required,
  not optional console defaults, discovered when omitting them produced a generic, unhelpful 400 error. That
  "genuine content condition" requirement turned out to fit this app's actual purpose well once the wizard was
  changed (per district feedback) from a broad OU+direction picker to specific sender/recipient addresses - the
  condition is now a real `all_headers.contains('the-address')` match, not a workaround. Testing also confirmed
  this API has no duplicate protection - sending the same request twice creates two separate
  active rules. If the live call fails for any reason, the app automatically falls back to the guided
  manual/deep-link flow rather than leaving you stuck. See the comment at the top of
  `server/src/services/policyService.ts` for the full confirmed schema.
- **The Drive trust rule feature was reworked mid-project** after the original design (block-all-external /
  allow-only-trusted-domains, scoped to an org unit) turned out not to match what the district actually needed:
  blocking Drive sharing between two specific internal people. Research (checked against Google's own help
  center and the Cloud Identity Policy API's supported-settings documentation) confirmed: (1) trust rules have
  no API at all - not even read-only, unlike DLP rules which do have API read/write support; and (2) a trust
  rule's "Scope" (sender) side can only be an org unit or a group, never a single named individual, while its
  "Condition" (target) side *can* name one specific person. The wizard was rebuilt around the resulting
  workaround - put the sender alone in a throwaway Google Group, then write the trust rule against that group
  naming the recipient in the condition - and generates full step-by-step instructions for it, including the
  reverse direction if requested. This is manual-only by necessity, not by choice: there is nothing for this app
  to call, so it can't create, list, or delete these rules the way it does for the live Gmail DLP path.
- No independent security review or penetration test has been performed. The session handling, admin-role
  gate, and OAuth flow follow standard, well-established patterns, but "written by AI following best
  practices" is not a substitute for your own security review before this touches a production identity
  system.
- No automated test suite exists yet (no Jest/Vitest tests were written). Verification so far is limited to
  type-checking, a production build, a smoke test of server startup/routing, and the real-world testing noted
  above.

## Recommendation

Before using this for real compliance changes: read through the code (it's a small, readable codebase — see
the "Project layout" section in `README.md`), test both wizards against low-stakes test addresses/OUs in your
own domain, and confirm the resulting Gmail/Drive settings in the Admin console match what you expected. If you
turn on `ENABLE_LIVE_DLP_API`, do that testing with the flag on: try a from-only address, a to-only address, and
a from-and-to pair, and check each resulting rule in Admin console (Security &rarr; Data protection &rarr;
Rules) shows the block action and address condition you expected before trusting it on a real address.
