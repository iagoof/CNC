## 2026-10-29 - Prevent User Role Escalation on Profile Update
**Vulnerability:** Authenticated non-admin users could elevate their privileges by updating their own user profile document (`/users/{userId}`) with `role: 'admin'`.
**Learning:** While profile creation checked `(incoming().role != 'admin' || isAdmin())`, profile updates only verified user ID and timestamp immutability.
**Prevention:** Always restrict privilege/role fields during document updates in security rules by requiring `incoming().role == existing().role || isAdmin()`.

## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.

## 2025-05-18 - Input Validation and Bounds for AI Server Endpoints
**Vulnerability:** Unbounded prompts, non-numeric parameters, and unstripped control characters passed directly to AI prompt interpolation in `server.ts` endpoints could lead to Denial of Service (DoS) and prompt parameter injection.
**Learning:** `server.ts` endpoints lacked input length validation and numeric bounds checks unlike `server/assemblyAi.ts`. Encapsulating Express routing via `createCncApp()` allowed direct integration testing against production route handlers.
**Prevention:** Always validate input types, trim string prompts, enforce character length limits (<= 4000 chars), sanitize non-numeric string parameters (`replace(/[^\w\s-]/g, '')`), and validate numeric bounds before interpolating parameters into LLM system instructions or sending requests to Google GenAI.
