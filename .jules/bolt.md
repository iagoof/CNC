## 2025-05-20 - SVG Sanitization Memoization in Render Loops
**Learning:** Calling `DOMParser` and `XMLSerializer` inside React render loops when rendering SVG vectors causes repeated DOM tree creation and serialization overhead on every keystroke or state change.
**Action:** Lift static Set initializations outside functions and memoize pure string transformations like `sanitizeSvg` using a bounded Map cache.
## 2026-10-22 - MaxRects Nesting Hot Loop Optimization
**Learning:** In 2D rectangular nesting algorithms (`packNesting`), inner loops checking candidate rectangle spaces and pruning redundant bounding boxes create high allocation overhead if temporary objects (`{ rect: ... }`) or array helper functions (`.filter`, `.some`) are used per piece iteration.
**Action:** Inline spatial comparisons and bounds calculations directly in standard `for` loops, avoiding object creation in hot paths while preserving exact placement ordering.
