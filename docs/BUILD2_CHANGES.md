# Build 2 Change and Acceptance Notes

## Prompt 1 — Onboarding and Core UX Fixes

- Onboarding now begins with one Focus Point in each FLOURISH Skill: 8 allocated, 38 remaining, and 46 required. Submission remains server-validated at exactly 46 total, with every Skill present and each value from 1–10.
- The public landing page and login entry validate the server session before rendering. Completed players enter `/home`; incomplete players enter `/onboarding`; missing or expired sessions remain in the public login flow.
- Skill accordions use stable Skill codes and preserve player-controlled expanded state while quest data refreshes. Quest actions are outside the trigger interaction boundary.
- Active Quest cards use stable responsive regions for rewarded Skills, title, difficulty, deadline, COUNT progress, XP, and actions. Content wraps without horizontal overflow at desktop and Pixel 7 widths.
- Daily and Weekly Challenge columns size to their own content instead of stretching the shorter Daily set to the Weekly set height. Neither section is collapsible in this change.
- Abandonment uses an accessible in-app modal naming the quest and Current Skill XP penalty. Cancel, backdrop dismissal, or Escape causes no mutation; focus enters and returns from the dialog; submission is disabled while pending; server failures appear in the existing application error feedback.

Acceptance includes unit/component coverage for initial Focus state, validation, accordion persistence and keyboard operation, dialog behavior and mutation guards, plus authenticated desktop and Pixel 7 Playwright coverage for routing and affected layouts.

## Prompt 1 Follow-Up — Recommendation Actions

- The Home recommendation now prioritizes **Accept quest**, which sends the displayed PlayerQuest ID through the existing authoritative Standard acceptance API and refreshes Home state and the next recommendation.
- The navigation-only **View this Standard quest** link was removed.
- **Something different** immediately re-runs established recommendation scoring over existing eligible `AVAILABLE` Standard slots while excluding the displayed recommendation when an alternative exists. It persists the selected recommendation but never rerolls, replaces, accepts, penalizes, or creates a Standard quest.
- If no alternative exists, the current recommendation remains visible and the player receives a clear in-app explanation. Stale recommendations are rejected rather than silently acting on another quest, after which the client reconciles authoritative quest and recommendation state.
- Both actions prevent duplicate submissions, expose accessible pending labels and in-app errors, and remain responsive at desktop and Pixel 7 widths.
