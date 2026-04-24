## 2024-04-22 - [GlobalSearch Accessibility]
**Learning:** Found a pattern where decorative icons lacked `aria-hidden="true"`, and `<input type="search">` elements lacked `aria-label` when no explicit `<label>` was provided. Additionally, a dropdown `<ul>` implementing `role="listbox"` lacked the corresponding `role="option"` on its child `<li>` elements, which breaks ARIA expectations.
**Action:** Always verify `role="listbox"` children explicitly declare `role="option"` to maintain valid ARIA hierarchy. Ensure decorative icons are hidden (`aria-hidden="true"`) and inputs without visible labels have an `aria-label`.

## 2026-04-23 - [Loading Feedback on Async Action Buttons]
**Learning:** For high-stakes asynchronous actions like deducting credits (`PremiumGate`), simply disabling the button and changing the text is insufficient UX and can make users uncertain if the action was registered. Adding a spinning indicator (`Loader2` with `animate-spin` and `aria-hidden="true"`) directly alongside the text significantly improves visual feedback. Ensure the button uses `gap-2` to clearly separate the icon and text.
**Action:** When working on buttons that handle critical async operations (especially those related to credits, payments, or destructive actions), proactively add a loading spinner to the button's content and space it properly.
