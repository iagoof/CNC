## 2026-10-27 - Tenant Isolation and Document Scoping in Firestore Security Rules
**Vulnerability:** `/financial_settings/{settingsId}` and `/products/{productId}` allowed any verified user to read and overwrite any other tenant's financial settings and product catalog (IDOR), perform unscoped collection list scraping, spoof owner IDs, and mutate immutable product fields (`ownerId`, `sku`, `createdAt`).
**Learning:** Checking only `isVerified()` without verifying `isOwner(existing()) || isAdmin()` on `get` and `update` allows cross-tenant read/write. Furthermore, collection queries (`allow list`) must enforce `resource.data.ownerId == request.auth.uid` to prevent global data scraping, and deterministic document IDs must be validated (`productId.matches('^' + request.auth.uid + '_[a-f0-9]{64}$')`) to prevent ID spoofing across accounts.
**Prevention:** In multi-tenant Firestore security rules, always bind document reads and writes to `isOwner(existing()) || isAdmin()`, enforce `incoming().ownerId == request.auth.uid` during creation, validate immutable business identity keys during updates (`sku`, `ownerId`, `createdAt`), and reject unscoped collection listings.

## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.

## 2025-05-18 - Input Validation and Bounds for AI Server Endpoints
**Vulnerability:** Unbounded prompts, non-numeric parameters, and unstripped control characters passed directly to AI prompt interpolation in `server.ts` endpoints could lead to Denial of Service (DoS) and prompt parameter injection.
**Learning:** `server.ts` endpoints lacked input length validation and numeric bounds checks unlike `server/assemblyAi.ts`. Encapsulating Express routing via `createCncApp()` allowed direct integration testing against production route handlers.
**Prevention:** Always validate input types, trim string prompts, enforce character length limits (<= 4000 chars), sanitize non-numeric string parameters (`replace(/[^\w\s-]/g, '')`), and validate numeric bounds before interpolating parameters into LLM system instructions or sending requests to Google GenAI.
