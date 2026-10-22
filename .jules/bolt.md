## 2026-10-22 - MaxRects Nesting Hot Loop Optimization
**Learning:** In 2D rectangular nesting algorithms (`packNesting`), inner loops checking candidate rectangle spaces and pruning redundant bounding boxes create high allocation overhead if temporary objects (`{ rect: ... }`) or array helper functions (`.filter`, `.some`) are used per piece iteration.
**Action:** Inline spatial comparisons and bounds calculations directly in standard `for` loops, avoiding object creation in hot paths while preserving exact placement ordering.
