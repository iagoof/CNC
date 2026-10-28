## 2025-05-20 - SVG Sanitization Memoization in Render Loops
**Learning:** Calling `DOMParser` and `XMLSerializer` inside React render loops when rendering SVG vectors causes repeated DOM tree creation and serialization overhead on every keystroke or state change.
**Action:** Lift static Set initializations outside functions and memoize pure string transformations like `sanitizeSvg` using a bounded Map cache.
## 2026-10-22 - MaxRects Nesting Hot Loop Optimization
**Learning:** In 2D rectangular nesting algorithms (`packNesting`), inner loops checking candidate rectangle spaces and pruning redundant bounding boxes create high allocation overhead if temporary objects (`{ rect: ... }`) or array helper functions (`.filter`, `.some`) are used per piece iteration.
**Action:** Inline spatial comparisons and bounds calculations directly in standard `for` loops, avoiding object creation in hot paths while preserving exact placement ordering.
## 2026-10-23 - 2D Spatial Containment Bounding Box Pruning
**Learning:** Spatial containment checks (`pointInContour`) that determine contour nesting levels in `orderedContours` and `compensateGeometry` execute $O(N^2 \cdot P)$ point-in-polygon ray-casting iterations across all contour points.
**Action:** Precalculate Axis-Aligned Bounding Boxes (AABB) for contours once and perform $O(1)$ range checks prior to running `pointInContour` to prune non-overlapping polygons.
## 2026-10-23 - Coordinate Key Unpacking Overhead in Raster Boundary Tracing
**Learning:** In pixel contour extraction algorithms (`traceBinaryMask`), calling `currentKey.split(',').map(Number)` inside the inner edge-traversal loop creates thousands of temporary string and array heap allocations per image tracing operation.
**Action:** Unpack initial coordinates once from `startKey` and track `currX`/`currY` directly as primitive numbers alongside string map keys during cycle decomposition.

## 2026-10-24 - Contour Area and Length Calculation Array Allocation Overhead
**Learning:** Calling `contour.points.slice(1).reduce(...)` inside vector metric calculations and kerf compensation loops allocates an $N-1$ size array and closure per contour on every metric calculation and $O(N^2)$ times inside kerf nesting filters.
**Action:** Replace `slice(1).reduce(...)` in `contourLength`, `contourArea`, and `signedArea` with direct `for` loops, and precalculate contour `areas` into a Map during kerf compensation.

## 2026-10-25 - Bounding Box Map Spread Allocation Overhead in Assembly Generation
**Learning:** Calling `Math.min(...p.outline.map(a => a[0]))` and `Math.max(...)` when computing bounding boxes allocates 4 intermediate arrays (`.map`) and creates spread argument overhead for every assembly part, layout row calculation, and validation step.
**Action:** Replace functional array `.map()` and spread syntax in 2D bounding box functions (`bounds`) with a single imperative `for` loop over points.
