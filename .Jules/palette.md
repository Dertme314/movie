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

## 2026-03-31 : Async Button Processing Feedback

**Learning:** Relying solely on disabled state or changed text (e.g., 'Uploading...') on buttons during async actions leaves users uncertain if the system is actually working or if it has frozen. Text alone lacks the dynamism needed to reassure the user.
**Action:** Always provide active visual feedback for async actions by injecting a lightweight, animated spinner (like `.btn-spinner`) alongside the text within a flex-aligned button.

## 2024-05-18 : Iconography Consistency

**Learning:** Text-based icons (like `✕`, `‹`, `▶`, `+`, `✓`, `⌄`) look inconsistent across different devices and operating systems because they rely on system fonts, making them difficult to align and style consistently.
**Action:** Always replace text characters meant to act as icons with properly formatted inline SVGs. This ensures crisp rendering, perfect alignment, and seamless interaction scaling (e.g. `transform: scale(1.1)`) across all platforms.

## 2026-04-03 : Contextual Input Clear Buttons

**Learning:** Showing a 'clear input' (X) button inside a search or text field before the user has typed anything creates unnecessary UI clutter and provides an action that cannot be performed.
**Action:** Always conditionally render or show/hide clear buttons based on the input's content state (e.g., toggling a `.has-text` class), ensuring the button is only visible when there is actual text to clear.

## 2026-04-05 : Auto-focusing Dynamically Revealed Inputs

**Learning:** When dynamically revealing primary input fields (like switching to a 'Receive' tab to enter a code or opening a search modal), users experience friction if they have to click the input field again to start typing.
**Action:** Always auto-focus (e.g., `element.focus()`) primary input fields when toggling their visibility via tab or modal navigation. Wrap the `.focus()` call in a brief `setTimeout` (e.g., 50ms) to ensure the DOM has rendered the element as visible before applying focus.

## 2024-05-18 : Active State Indicators Animation

**Learning:** Using CSS transform transitions on `scaleX()` (from 0 to 1) for active state indicators like tab underlines creates a much smoother reveal animation than instant state changes.
**Action:** When creating active or selected state indicators, apply `transform: scaleX(0)` by default and transition to `scaleX(1)` with `transition: transform 0.3s ease` to ensure the transition is smooth.

## 2026-04-17 : Input Clear Buttons

**Learning:** Adding clear buttons to input fields (like search or sync PIN inputs) improves UX by allowing users to quickly wipe the field. However, to avoid visual clutter, these buttons should only be shown when the input is non-empty. We can use a `.has-text` class to conditionally display the button.
**Action:** When creating new input fields with clear functionality, wrap the input and the clear button in a container. Toggle a `.has-text` class on the container dynamically via JS to conditionally render the clear button, ensuring a cleaner default UI.

## 2026-04-10 : Animating Active States

**Learning:** Abruptly switching states (like instantly appearing underlines on active tabs) feels cheap and breaks visual continuity, whereas smooth reveals feel deliberate and premium.
**Action:** When designing indicators for active or selected states (like tab underlines), use CSS transitions on transform properties (like `scaleX(0)` to `scaleX(1)`) to create smooth reveal animations rather than relying on instant state changes.

## 2024-05-19 : Filter caret rotation and tactile buttons

**Learning:** Found that custom dropdowns in this app (like the filter menu) lacked micro-interactions for the trigger buttons (caret rotation) and internal items (hover/active transitions), making them feel slightly rigid. Also, `.btn-white` was missing the tactile scale-down `active:scale-95` equivalent that primary buttons use.
**Action:** Always add `transform: rotate()` transitions to carets on dropdown triggers when toggling their `.open` class. Ensure that all button variants (like `.btn-white`, `.btn-gray`) get an `.active` scaling transition so tactile feedback is consistent across the entire application. Added `transition: all 0.2s ease` to list items (`.filter-item`) to ensure hover state changes feel polished.
## 2024-05-18 : Tactile Feedback Animations
**Learning:** For smooth visual feedback when adding `:active { transform: scale(...) }` tactile animations, the base CSS class must explicitly include a corresponding `transform` transition (e.g., `transition: transform 0.2s ease`). Otherwise, elements will snap instantly instead of scaling smoothly, which disrupts the premium feel of the app.
**Action:** When adding or updating tactile scaling effects on components like `.player-back`, `.sync-close`, or `.suggest-item`, always ensure `transform 0.2s ease` is added to the component's base `transition` property list.
