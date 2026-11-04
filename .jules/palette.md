## 2025-05-18 - Label Associations and Icon Button ARIA Attributes in ERP Tables
**Learning:** Dense data tables and modal forms in ERP/Industrial apps often omit explicit label `htmlFor` bindings and button `aria-label`s on +/- stock controls, making screen reader navigation ambiguous.
**Action:** Always verify that every input in modal forms has an `id` matching its `<label htmlFor="...">`, and ensure all icon-only action buttons in data tables include dynamic, contextual `aria-label`s and `focus-visible` ring indicators.

## 2025-05-19 - Segmented Toggle Buttons and Form Sliders in Pricing Engines
**Learning:** Dense engineering calculators and financial pricing forms often use pill/segmented toggle buttons (e.g. sales channel fee toggles) and range sliders without semantic state or accessible label bindings, preventing screen reader users from discovering active toggle selection or slider bounds.
**Action:** Always wrap toggle button groups with `role="group"` and `aria-label`, bind `aria-pressed` to active state on toggle options, and provide range sliders with explicit `htmlFor`/`id` labels, `aria-valuemin`/`max`/`now`, and `focus-visible:ring-2` focus rings.
