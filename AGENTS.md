# AGENTS.md

## Must-follow constraints
- **Styling**: Use Tailwind CSS utility classes only. Do not add custom CSS files.
- **Animations**: Use `motion` (from `motion/react`) for all UI transitions.
- **Icons**: Use `lucide-react`.
- **Environment Variables**: Use `import.meta.env.VITE_` prefix for client-side variables.
- **Error Handling**: Do not remove or disable the chunk error recovery scripts in `index.html` and `main.tsx`.
- **Analytics**: Vercel Analytics (`@vercel/analytics`) is integrated in `main.tsx`.

## Validation before finishing
- Run `npm run lint` (`tsc --noEmit`) to catch type errors.
- Run `npm run build` to ensure the app compiles successfully.

## Repo-specific conventions
- **App Structure**: `App.tsx` is the central hub for routing and state. It is intentionally large; use `grep` to locate specific views or handlers.
- **Data Persistence**: Hatim data is managed via a central `data` state in `App.tsx` and synced with Firebase/localStorage.
- **Class Components**: `ErrorBoundary` in `App.tsx` is a class component; ensure `props.children` is used correctly.
- **Scrollable Cards**: Horizontal scrolling cards (like in `ProfilePage.tsx`) use standard CSS scrollbars and custom mouse drag-to-scroll logic for desktop support.

## Important locations
- `src/App.tsx`: Main application logic, routing, and state management.
- `src/components/`: Reusable UI components (StatsPage, ProfilePage, AuthModal, etc.).
- `src/contexts/AuthContext.tsx`: Firebase authentication logic, including Magic Link detection.
- `src/lib/webauthn.ts`: Passkey (WebAuthn) registration and verification logic.

## Authentication
- **Magic Link**: Uses `sendSignInLinkToEmail` and `isSignInWithEmailLink`. The email is stored in `localStorage` (`emailForSignIn`) to complete the flow.
- **Passkeys (Biometric)**: Uses the browser's `navigator.credentials` API. Public keys (credential IDs) are stored in Firestore under `users/{uid}/passkeys/{credentialId}`. Passkeys act as a secure wrapper around a randomly generated Firebase email/password combination. Users can manage (add/delete) their passkeys from the Settings menu.

## Notifications
- **OneSignal Integration**: Uses `react-onesignal` for push notifications.
- **External ID Mapping**: The Firebase `user.uid` is mapped to OneSignal's `external_id` using `OneSignal.login(user.uid)`. This allows sending notifications directly to a specific user via their Firebase UID.
- **Server-Side Sending**: Notifications are sent via `/api/notifications/send` (Vercel serverless function) which proxies requests to the OneSignal REST API.
- **Environment Variables**: Requires `VITE_ONESIGNAL_APP_ID` (client-side) and `ONESIGNAL_REST_API_KEY` (server-side).
- **Duplicate Prevention**: A `isInitialNotifLoad` ref in `App.tsx` prevents old unread notifications from triggering browser alerts on app startup.

## AI Chat
- **Pollinations.ai Integration**: The app features an AI chat powered by Pollinations.ai.
- **Authentication**: Uses a standard API key provided via the `VITE_POLLINATIONS_API_KEY` environment variable.
- **Model & Scope**: The chat strictly uses the `qwen-safety` model and is restricted to answering questions related to religious topics only.

## Known gotchas
- **Chunk Errors**: The environment frequently triggers chunk loading errors. The recovery script in `index.html` and `main.tsx` is critical for app stability.
- **Theme**: `next-themes` is configured with `forcedTheme="dark"`. Do not attempt to implement a light mode unless explicitly requested.
- **Sound**: `use-sound` is used for interaction feedback; ensure `playClick` is called on primary actions.
- **Storage Keys**: Hatim data uses `hatim_data_v1` and Zikir tasks use `local_zikir_tasks` in `localStorage`.
- **Modals**: Modals like `AuthModal` should automatically close when the user state changes (e.g., successful login). Reading commitment modals require explicit user input (page count) and must not close if the input is invalid.
