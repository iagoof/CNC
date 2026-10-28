## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.

## 2026-10-27 - Multi-tenant Collection Ownership Authorization and Immutability in Firestore Rules
**Vulnerability:** Firestore rules for user domain collections (`projects`, `orders`, `materials`, `quotes`, `settings`, `financial_settings`, `products`, `sales_orders`, `machines`) lacked ownership verification on `get`, `list`, `create`, `update`, and `delete` operations, allowing authenticated users to read, update, delete, or spoof `ownerId` on other users' records (IDOR / Broken Access Control).
**Learning:** Checking `isOwner(incoming())` on creation, `isOwnerOrAdmin(existing())` and `incoming().ownerId == existing().ownerId` on update/delete, and `(resource == null || isOwnerOrAdmin(existing()))` on list/get enforces strict multi-tenant isolation and query filtering. Also, string prefix matching in Firestore rules requires `.matches('^' + prefix + '.*')` instead of `.startsWith()`.
**Prevention:** Always enforce `ownerId` match with `request.auth.uid` on creation, `ownerId` immutability on updates, and owner/admin checks on all read/write rules for tenant collections in `firestore.rules`.

## 2025-05-18 - Input Validation and Bounds for AI Server Endpoints
**Vulnerability:** Unbounded prompts, non-numeric parameters, and unstripped control characters passed directly to AI prompt interpolation in `server.ts` endpoints could lead to Denial of Service (DoS) and prompt parameter injection.
**Learning:** `server.ts` endpoints lacked input length validation and numeric bounds checks unlike `server/assemblyAi.ts`. Encapsulating Express routing via `createCncApp()` allowed direct integration testing against production route handlers.
**Prevention:** Always validate input types, trim string prompts, enforce character length limits (<= 4000 chars), sanitize non-numeric string parameters (`replace(/[^\w\s-]/g, '')`), and validate numeric bounds before interpolating parameters into LLM system instructions or sending requests to Google GenAI.
