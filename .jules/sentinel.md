## 2026-10-26 - Restrict User Profile Access and Account Creation Spoofing
**Vulnerability:** Any authenticated user with a verified email could access or read any other user's profile document (`/users/{userId}`) and potentially set arbitrary `userId`s during profile creation.
**Learning:** Firestore rules permissions must validate that `request.auth.uid == userId` for individual document paths like `/users/{userId}` to prevent direct IDOR (Insecure Direct Object Reference) access.
**Prevention:** Always restrict direct single-document CRUD operations (`get`, `create`, `update`) on user profile collections by checking `request.auth.uid == userId`.
