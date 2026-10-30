## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.

## 2025-05-18 - Input Validation and Bounds for AI Server Endpoints
**Vulnerability:** Unbounded prompts, non-numeric parameters, and unstripped control characters passed directly to AI prompt interpolation in `server.ts` endpoints could lead to Denial of Service (DoS) and prompt parameter injection.
**Learning:** `server.ts` endpoints lacked input length validation and numeric bounds checks unlike `server/assemblyAi.ts`. Encapsulating Express routing via `createCncApp()` allowed direct integration testing against production route handlers.
**Prevention:** Always validate input types, trim string prompts, enforce character length limits (<= 4000 chars), sanitize non-numeric string parameters (`replace(/[^\w\s-]/g, '')`), and validate numeric bounds before interpolating parameters into LLM system instructions or sending requests to Google GenAI.

## 2026-10-27 - Zero-Trust Multi-Tenant ABAC Enforcement in Firestore Collections
**Vulnerability:** Multi-tenant collections (`projects`, `orders`, `materials`, `quotes`, `settings`, `financial_settings`, `products`, `sales_orders`, `machines`) allowed any verified user to read, list, update, or delete other users' documents, and create documents with spoofed `ownerId`s.
**Learning:** Helper functions like `isOwner` must be explicitly attached to all collection `match` rules. In Firestore security rules, `.matches()` tests full string matching in RE2, requiring a `.*` suffix for prefix pattern checks, and `get` rules must handle `resource == null` cleanly.
**Prevention:** Enforce `isOwnerOrAdmin` on `get`, `list`, `update`, and `delete` rules, validate `incoming().ownerId == request.auth.uid` on `create`, mandate immutability of `ownerId` on `update`, and ensure `resource == null || isOwnerOrAdmin(...)` on `get` to allow safe existence checks in transactions.
