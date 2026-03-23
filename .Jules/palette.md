## 2026-03-19 - Hidden form inputs without labels
**Learning:** Discovered inputs relying solely on `placeholder` text for labeling (search, sync code), which breaks accessibility for screen reader users and fails WCAG criteria.
**Action:** Always provide an explicit `aria-label` (or `<label>`) on input fields, especially standalone ones like search bars or code inputs where visible labels aren't in the design.

## 2026-03-20 - Empty states without calls to action
**Learning:** Found an empty state (My List) that explained the situation but left users stranded without a clear path forward.
**Action:** Always provide a relevant, helpful call-to-action (CTA) button in empty states to guide users back into the core application flow (e.g., "Browse Content").
## 2026-03-21 - Keyboard Accessibility on Interactive Divs
**Learning:** Custom interactive elements (like `div`-based media cards) often lack native keyboard support (focusability, Enter/Space activation) which breaks navigation for keyboard/screen reader users.
**Action:** Always add `tabIndex="0"`, `role="button"`, and `keydown` handlers mapping Enter/Space to click actions for non-native interactive elements.
