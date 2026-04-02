## 2026-03-19 - Hidden form inputs without labels
**Learning:** Discovered inputs relying solely on `placeholder` text for labeling (search, sync code), which breaks accessibility for screen reader users and fails WCAG criteria.
**Action:** Always provide an explicit `aria-label` (or `<label>`) on input fields, especially standalone ones like search bars or code inputs where visible labels aren't in the design.

## 2026-03-20 - Empty states without calls to action
**Learning:** Found an empty state (My List) that explained the situation but left users stranded without a clear path forward.
**Action:** Always provide a relevant, helpful call-to-action (CTA) button in empty states to guide users back into the core application flow (e.g., "Browse Content").
## 2026-03-21 - Keyboard Accessibility on Interactive Divs
**Learning:** Custom interactive elements (like `div`-based media cards) often lack native keyboard support (focusability, Enter/Space activation) which breaks navigation for keyboard/screen reader users.
**Action:** Always add `tabIndex="0"`, `role="button"`, and `keydown` handlers mapping Enter/Space to click actions for non-native interactive elements.

## 2026-03-25 : Beautiful Empty States
**Learning:** Plain text error and empty messages ("No results found") make the interface feel broken or unresponsive. Using an established `.empty-state` component with an SVG icon and clear, actionable subtext dramatically improves the perceived quality of the app.
**Action:** Always check if a project has an existing `.empty-state` class or similar pattern before inserting raw text into the DOM for empty states.

## 2026-03-26 : Inline Feedback vs Global Toasts
**Learning:** For direct, self-contained interactive components like a generated PIN code, a global toast ("PIN copied to clipboard") isn't enough to make the interaction feel truly responsive or premium. The visual distance between the action (clicking the PIN) and the feedback (a toast at the bottom/top of the screen) creates a slight disconnect.
**Action:** When users interact with a single prominent piece of data (like copying a code), always provide immediate inline visual feedback (e.g., transforming the code text to "COPIED", changing the background color locally) in addition to, or instead of, a global notification.

## 2026-04-02 : Visual Feedback on Async and Icon Buttons
**Learning:** Pure text changes on async buttons ("Uploading...") can be missed by users, and icon-only buttons (like search) without `active` states feel unresponsive on mobile/touch interfaces.
**Action:** Always include a visual spinner (`.btn-spinner`) for async network requests in modals, and apply `active:scale-95` type transform feedback to all interactive icon buttons to improve perceived performance.
