## 2026-03-19 - Hidden form inputs without labels
**Learning:** Discovered inputs relying solely on `placeholder` text for labeling (search, sync code), which breaks accessibility for screen reader users and fails WCAG criteria.
**Action:** Always provide an explicit `aria-label` (or `<label>`) on input fields, especially standalone ones like search bars or code inputs where visible labels aren't in the design.
