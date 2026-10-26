## 2025-05-18 - Label Associations and Icon Button ARIA Attributes in ERP Tables
**Learning:** Dense data tables and modal forms in ERP/Industrial apps often omit explicit label `htmlFor` bindings and button `aria-label`s on +/- stock controls, making screen reader navigation ambiguous.
**Action:** Always verify that every input in modal forms has an `id` matching its `<label htmlFor="...">`, and ensure all icon-only action buttons in data tables include dynamic, contextual `aria-label`s and `focus-visible` ring indicators.
