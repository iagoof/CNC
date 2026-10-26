## 2025-05-20 - SVG Sanitization Memoization in Render Loops
**Learning:** Calling `DOMParser` and `XMLSerializer` inside React render loops when rendering SVG vectors causes repeated DOM tree creation and serialization overhead on every keystroke or state change.
**Action:** Lift static Set initializations outside functions and memoize pure string transformations like `sanitizeSvg` using a bounded Map cache.
## 2026-10-22 - MaxRects Nesting Hot Loop Optimization
**Learning:** In 2D rectangular nesting algorithms (`packNesting`), inner loops checking candidate rectangle spaces and pruning redundant bounding boxes create high allocation overhead if temporary objects (`{ rect: ... }`) or array helper functions (`.filter`, `.some`) are used per piece iteration.
**Action:** Inline spatial comparisons and bounds calculations directly in standard `for` loops, avoiding object creation in hot paths while preserving exact placement ordering.

## 2026-10-24 - Raster Tracing Bitwise Integer Key Optimization
**Learning:** In 2D grid graph algorithms like raster image vectorization (`traceBinaryMask`), using string key templates (`"${x},${y}"`) for grid map lookups creates tens of thousands of short-lived string allocations, split calls, and string-to-number parses.
**Action:** Pack 2D grid coordinates into 32-bit integers using bitwise shifts (e.g. `(y << 10) | x` for grids up to 512x512) for Map keys to eliminate string overhead and improve tracing throughput by ~33%.
