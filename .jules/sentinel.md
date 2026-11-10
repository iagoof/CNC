## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.

## 2025-05-18 - Input Validation and Bounds for AI Server Endpoints
**Vulnerability:** Unbounded prompts, non-numeric parameters, and unstripped control characters passed directly to AI prompt interpolation in `server.ts` endpoints could lead to Denial of Service (DoS) and prompt parameter injection.
**Learning:** `server.ts` endpoints lacked input length validation and numeric bounds checks unlike `server/assemblyAi.ts`. Encapsulating Express routing via `createCncApp()` allowed direct integration testing against production route handlers.
**Prevention:** Always validate input types, trim string prompts, enforce character length limits (<= 4000 chars), sanitize non-numeric string parameters (`replace(/[^\w\s-]/g, '')`), and validate numeric bounds before interpolating parameters into LLM system instructions or sending requests to Google GenAI.

## 2026-11-10 - Concurrency Limiting, Rate Limiting, and Security Headers for AI Server
**Vulnerability:** Downstream AI endpoints in `server.ts` (`generate-cad-vector`, `optimize-prompt`, `diagnose-gcode`) lacked rate limiting and concurrency throttling, allowing unauthenticated or rogue clients to flood expensive Google GenAI requests, deplete API quotas, and exhaust server resources. Furthermore, the Express server leaked runtime identity via `X-Powered-By` and omitted baseline HTTP defense headers.
**Learning:** Adding input validation without pairing it with concurrency bounds and client-IP rate limiting leaves serverless/long-running AI endpoints exposed to DoS. Hardening Express apps requires explicitly disabling framework headers and setting modern headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`).
**Prevention:** Pair every upstream LLM/AI proxy endpoint with per-IP rate limits and global concurrency guards returning HTTP 429 (`Retry-After`), and apply defensive security headers at the root router level.
