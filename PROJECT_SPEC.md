# Delivery Rider App — Live Location Tracking (Android)

## Project Overview
Build a React Native (CLI, TypeScript) Android-only app for delivery riders. Rider logs in via Firebase email/password auth. While "On Duty", the app tracks device location every 10 seconds — **including in the background** — and saves a new log entry to Firestore only when the rider has moved 30+ meters from the last saved point (using Haversine great-circle distance, not raw lat/lng delta). Offline location changes must queue locally and auto-sync when connectivity returns, without duplicating or losing entries. Home screen shows a live, chronologically ordered list of saved location logs, plus a map with the rider's path.

**Platform:** Android only (no iOS work)
**Stack:** React Native CLI + TypeScript
**Backend:** Firebase Auth (email/password) + Firestore
**Constraint:** Open-source libraries only — no paid SDKs or services required to run/review.

---

## Tech Stack & Key Libraries
- `react-native` (CLI, TypeScript template)
- `@react-navigation/native` + `@react-navigation/native-stack`
- `@react-native-firebase/app`, `@react-native-firebase/auth`, `@react-native-firebase/firestore`
- `@react-native-async-storage/async-storage` — offline queue persistence
- `@react-native-community/netinfo` — connectivity detection
- `@react-native-community/geolocation` — location fixes (foreground + as base for background)
- `react-native-maps` (Google provider) — map + path (Polyline) visualization; needs a placeholder Android Maps API key
- Background location (free/OSS, no paid tier): `react-native-background-actions` (foreground service wrapper) driving a 10-second polling loop, OR a custom native Android foreground service module if the JS-level approach proves unreliable. **Do not use `react-native-background-geolocation`'s paid tier.** Decision + reasoning must go in the README.

---

## Folder Structure
```
src/
  screens/
    LoginScreen.tsx
    SignUpScreen.tsx
    HomeScreen.tsx          // map + path + log list
  services/
    firebase.ts             // firebase init/exports
    authService.ts           // signup, login, logout
    locationService.ts       // watch/background tracking control
    distanceUtils.ts          // Haversine + threshold check
    offlineQueue.ts           // AsyncStorage queue + NetInfo sync
    firestoreService.ts       // save location, real-time log listener
  context/
    AuthContext.tsx
  types/
    index.ts
  utils/
    permissions.ts            // Android runtime permission requests
__tests__/
  distanceUtils.test.ts
```

---

## Part 1 — Project Setup ✅ (done)
- [x] `npx react-native init` with TypeScript template
- [x] `npx react-native run-android` verified working
- [ ] Folder structure created per above
- [ ] Navigation installed: `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`
- [ ] `@react-native-async-storage/async-storage`, `@react-native-community/netinfo` installed
- [ ] Git init + commit: `chore: project setup`

## Part 2 — Firebase Setup ✅ (done)
- [x] Firebase project created, Android app added, package name matches `applicationId`
- [x] `google-services.json` added to `android/app/`
- [x] `classpath 'com.google.gms:google-services:...'` in root `android/build.gradle` → `buildscript { dependencies {} }`
- [x] `apply plugin: 'com.google.gms.google-services'` at bottom of `android/app/build.gradle`
- [ ] `@react-native-firebase/app`, `@react-native-firebase/auth`, `@react-native-firebase/firestore` installed
- [ ] Email/Password provider enabled in Firebase Console
- [ ] Firestore database created (test mode)
- [ ] Firestore schema for `locations` collection: `{ riderId: string, lat: number, lng: number, timestamp: Timestamp, distanceMoved: number }`
- [ ] `./gradlew clean && npx react-native run-android` passes clean (confirms Firebase wiring)
- [ ] `.gitignore` includes `google-services.json`; a `google-services.json.example` placeholder committed instead
- [ ] Commit: `feat: firebase config`

## Part 3 — Firebase Login (next up)
- [x] `src/context/AuthContext.tsx` — `onAuthStateChanged()` listener, exposes `user`, `loading`
- [x] `SignUpScreen.tsx` — email + password, validation, `createUserWithEmailAndPassword`
- [x] `LoginScreen.tsx` — email + password, validation, `signInWithEmailAndPassword`
- [x] Root navigator switches Auth stack ↔ Home stack based on `AuthContext.user`
- [x] Logout button on Home screen → `authService.logOut()`
- [x] Map Firebase error codes (`auth/wrong-password`, `auth/user-not-found`, `auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`) to friendly messages
- [x] Test: signup → restart app → still logged in (session persists) → logout → back to login screen
- [ ] Commit: `feat: auth flow`

> Implementation note: the installed `@react-native-firebase/auth` version (26.4.0) ships **modular-only** API — the classic `auth().signInWithEmailAndPassword()` namespaced calls used in earlier RNFB versions are not exported. Code uses `getAuth()`, `signInWithEmailAndPassword(auth, email, password)`, `onAuthStateChanged(auth, callback)`, `signOut(auth)` instead. Functionally equivalent to what this spec describes.

## Part 4 — Geolocation (sequential sub-tasks — map first, then real tracking)

### 4.1 — Basic Map + Current Location (foundation)
- [x] Install `react-native-maps` (Google provider), add placeholder Android Maps API key
- [x] Add `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` to `AndroidManifest.xml`, request at runtime — runtime request via `src/utils/permissions.ts` (`requestLocationPermission()`, handles granted/denied/never-ask-again, never throws)
- [x] Render a simple `MapView` on Home screen — `PROVIDER_GOOGLE`, full-width, 320px fixed height, above the log-list placeholder
- [x] Fetch current location once (foreground) via `@react-native-community/geolocation` → show marker — `getCurrentPosition()` in a `useEffect`, both success and error callbacks handled
- [x] Animate/center map on current location — `initialRegion` set from fetched coords, `latitudeDelta`/`longitudeDelta` 0.01

> Permission denied or location fetch failure → map area shows a fallback message ("Location permission required to show your position" / "Unable to fetch location") instead of crashing. Current lat/lng kept in `HomeScreen` state (`currentLocation`) for 4.2's path drawing.

### 4.2 — Path Drawing (visualize movement)
- [x] Static/dummy array of lat-lng test points → render as `Polyline` on the map — `buildDummyPath()` generates 5 points around the fetched current location (small incremental offsets), `strokeWidth={4}` `strokeColor="#2196F3"`
- [x] Start marker (pickup/user) + end marker (rider/current) — green "Start" pin at `pathCoords[0]`, red "Current Position" pin at the last point; if only one point exists, a single red "Current Position" pin is shown and the Polyline is skipped (avoids the <2-point crash)
- [x] Structure the coordinates as state so new points can be appended dynamically later — `pathCoords: Coordinates[]` state (replaces the old single `currentLocation` state); map auto-fits to all points via `fitToCoordinates` (MapView ref) whenever `pathCoords` changes

> Dummy path is temporary/testing data — Part 4.5 replaces `buildDummyPath()` with real tracking fixes appended over time.

### 4.3 — Live Foreground Tracking
- [x] `Geolocation.watchPosition` for live foreground updates (background comes later, in 4.5) — started right after the initial `getCurrentPosition` fix, options `{ enableHighAccuracy: false, distanceFilter: 0, interval: 10000, fastestInterval: 5000 }` (no filtering yet — 4.4 adds the 30m threshold)
- [x] On each fix: move marker, append point to the `Polyline` coordinates — `setPathCoords(prev => [...prev, point])`; end marker + Polyline re-render automatically since they're derived from `pathCoords`
- [x] Confirms map + live movement works correctly at the UI level before background complexity is added — `buildDummyPath()` removed, `pathCoords` now starts as a single real fix and grows from real `watchPosition` updates; each update also `console.log`'d for verification even when map tiles aren't visually loading
- [x] `clearWatch(watchId)` in the effect cleanup (component unmount) to avoid a dangling watch/battery drain
- [x] `watchPosition` error callback logs and leaves existing `pathCoords`/marker untouched (no crash, no data loss on a transient fix error)

### 4.4 — Distance Logic
- [x] `src/services/distanceUtils.ts`: `getDistanceInMeters()` — proper Haversine (sin/cos/atan2, `EARTH_RADIUS_METERS = 6371000`), not a flat lat/lng delta
- [x] `shouldSaveLocation(lastSaved, current, thresholdMeters = 30): boolean` — `true` when `lastSaved` is `null` (first fix), otherwise `getDistanceInMeters(...) >= thresholdMeters`
- [x] `__tests__/distanceUtils.test.ts` — 7 tests, all passing: same-point (0m), ~100m known separation (±5m tolerance), and boundary cases 29m → false, 30m → true, 31m → true (test fixtures generated by offsetting purely along latitude, so the expected distance is exact, independent of the Haversine implementation under test)
- [x] Wired into the 4.3 `watchPosition` flow — `lastSavedPointRef` (a ref, not state, since it's read inside the long-lived watch callback) tracks the last point actually saved; each fix now updates a separate `currentPosition` state (marker always moves) and only appends to `pathCoords` (the trail/Polyline) when `shouldSaveLocation` returns true; distance + save/skip decision logged via `console.log` on every fix

### 4.5 — On Duty Toggle + Background Service
- [x] On Duty / Off Duty toggle UI on Home screen — `Switch` in a card above "Live Location", label + subtitle reflect current state, swaps to a spinner while starting/stopping
- [x] Request `ACCESS_BACKGROUND_LOCATION` (Android 10+) with rationale dialog, after foreground permission already granted — `requestBackgroundLocationPermission()` in `permissions.ts` checks `ACCESS_FINE_LOCATION` is granted first, shows an `Alert` rationale, then requests `ACCESS_BACKGROUND_LOCATION`
- [x] Add `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (API 34+) to manifest — plus `ACCESS_BACKGROUND_LOCATION`; also overrides `react-native-background-actions`'s `<service>` with `android:foregroundServiceType="location"` (required on API 34+, the library's own manifest doesn't set one)
- [x] Foreground service (`react-native-background-actions`, installed — no paid SDK) with persistent notification — `taskTitle: "Rider is On Duty"`, `taskDesc: "Tracking your location"`
- [x] 10-second polling loop runs inside the service — `src/services/locationService.ts`'s `trackingTask()` follows the library's documented `while (BackgroundService.isRunning())` pattern, `getCurrentPosition` + `sleep(10000)` each iteration; not yet re-verified with the app minimized in this session
- [x] Off Duty or logout stops the service cleanly — `stopLocationTracking()` called from the toggle's off-path and from `handleLogout()`
- [x] Permission denial → toggle stays off, `Alert` shown, no crash — `handleToggleDuty` returns early without flipping `isOnDuty` to true if permission is denied

> Consolidation (foreground vs background): 4.3's `watchPosition` now only moves the live marker (`currentPosition`) — it no longer decides what's "saved". The On Duty background service is the single source of truth for the path: it runs its own 30m-threshold check (`distanceUtils.ts`) independent of React state, and emits a `MapTask:locationUpdate` event (via `DeviceEventEmitter`, no extra dependency) that `HomeScreen` listens for to append confirmed points to `pathCoords`. This also matches the product brief — points are only meant to be "saved" while On Duty.
>
> `react-native-background-actions` has native Android code and has no bundled TypeScript types — a local ambient declaration lives at `src/types/react-native-background-actions.d.ts`. Like the other native dependencies added this session, this needs a full `gradlew clean` + reinstall (not just a Metro reload) before the service will actually run on-device.
>
> **Debugging note (distance always 0m / list only updates on toggle / marker not moving):** a "stale React closure" hypothesis was raised and audited against the code — it doesn't hold: `lastSavedPoint` is a plain module-level variable in `locationService.ts`, not `useState`, and isn't read inside any React component at all; `HomeScreen`'s own state updates already use closure-safe patterns (functional `setPathCoords(prev => ...)`, plain `setCurrentPosition(value)`). The actual mechanism producing these symptoms was the missing try/catch noted above — the tracking loop dying after one iteration, so every On Duty toggle started a fresh, single-fix session. To make this easy to re-verify without physically walking, `trackingTask()`'s per-fix logic was extracted into an exported `processLocationFix()` (used by both the real loop and testing), plus a `resetTrackingState()` export and `src/utils/mockLocationTest.ts` (`buildMockTestPoints()` — 0/15/30/50/100/150m fixtures via the same latitude-offset technique as the Haversine tests). `HomeScreen` has a `__DEV__`-only "Run Test Mode" button that resets tracking state and feeds these mock points through `processLocationFix()` two seconds apart — this exercises the real threshold/save/UI-update pipeline (including a real Firestore write) without GPS or movement, and should be removed (or left `__DEV__`-gated) before a release build. **Remember:** this only validates the JS-side pipeline — it does not rule out native-layer issues like a build's `abiFilters` excluding the test device's CPU architecture.
>
> **Second "frozen pipeline" report, re-audited against a fresh stale-closure hypothesis — still doesn't hold.** Checked explicitly: (a) foreground watch is in `useEffect([])` — correct, runs once; background loop is plain async code, not a `useEffect` at all; (b) confirmed again `lastSavedPoint` is not `useState`/`useRef` — a module-level `let` outside any component, so React's stale-closure mechanism can't apply to it; (c) `pathCoords`/`currentPosition` updates are functional or plain value sets — no `.push()`/mutation anywhere; (d) `Marker`/`Polyline` bound directly to live state, not a one-time constant — though `MapView`'s `initialRegion` prop is genuinely set-once by react-native-maps' own design, so the camera won't auto-pan to follow the marker (a real, separate, minor UX gap, not why the marker itself would stop moving); (e) the toggle does call `startLocationTracking()`/`stopLocationTracking()`, not a UI-only flip. Reported as still broken on **both** a debug build and the signed APK — since the JS logic checks out, the leading suspects are environmental: the debug session likely wasn't a full fresh reload after the previous round's fixes (a Fast-Refreshed session can leave an already-running headless task on old code), and/or the signed APK still has the `abiFilters "x86_64"` problem noted earlier (native Geolocation not loading at all on an ARM test device produces this exact "frozen after first fix" signature regardless of JS correctness).
>
> Added **permanent** (not to be removed) one-line-per-fix logs: `[Tracking] Fix #N lat=... lng=... distance=...m saved=... time=...` in `processLocationFix()` (official/background pipeline), and `[Tracking] Marker fix #N ...` in `HomeScreen`'s foreground `watchPosition` callback (live-marker pipeline). Next test: from a **fully restarted** app (not hot-reloaded), watch for both counters incrementing roughly every 10s — if neither moves at all, the issue is native-layer (Geolocation not firing), not JS.
>
> **Self-verification pass (no device access) — full re-audit, unit test, and static trace, all clean.** Re-read both files line-by-line again: no `.push()`/mutation anywhere (`setPathCoords` uses replace or `prev => [...prev, x]`, `setCurrentPosition` is a plain value set), the one `useRef` (`mapRef`) is only ever accessed via `.current`, no overlapping-watch risk (foreground watch is `useEffect([])` guarded by `isMounted`/cleanup, background loop is guarded by `BackgroundService.isRunning()`), and all 4 `useEffect` dependency arrays match their actual reads. `lastSavedPoint` is still confirmed to be a module-level `let`, not `useState`/`useRef` — nothing to convert. Added 2 new tests to `__tests__/distanceUtils.test.ts` simulating a sequential 6-fix walk (0/10/45/55/95/100m from origin) through `shouldSaveLocation`, asserting the exact save/skip pattern `[true, false, true, false, true, false]` — this pattern is only reproducible if the last-saved reference updates correctly between calls (a stale reference would flip the 55m and 100m checks to `true`); **8/8 tests pass**. Static trace confirmed the full fix→UI chain has no break: `watchPosition`/`processLocationFix` → `setCurrentPosition`/`setPathCoords` → `Polyline`/`Marker` re-render + `fitToCoordinates` (camera pan) → separately, the Firestore write → `onSnapshot` → `setLocationLogs` → `FlatList` row. **What this does and doesn't prove:** the JS/React logic is verified correct by test + trace; it does **not** verify that native `Geolocation.getCurrentPosition`/`watchPosition` calls are actually firing on the test device — that can only be confirmed by watching the `[Tracking] Fix #N` / `[Tracking] Marker fix #N` / `[BackgroundLocation] Loop iteration #N` logs on a real, freshly-restarted app for 2-3 minutes (no walking needed, these are time-based, not movement-based). If those logs never appear at all, the remaining candidates are environmental, not JS: a stale build (hot-reloaded session running pre-fix code) or the signed APK's `abiFilters "x86_64"` excluding the real ARM test device.

### 4.6 — Firestore Save + Home List
- [x] On each background fix, run 4.4's threshold check against last **saved** point — already done in `locationService.ts`'s `trackingTask()` (Part 4.5); this step wires a Firestore write onto that same decision
- [x] If >= 30m and online: write `{ riderId, lat, lng, timestamp, distanceMoved }` to Firestore, update last-saved-point — `saveLocationLog()` in `src/services/firestoreService.ts`, called from `trackingTask()` with `auth.currentUser?.uid`
- [x] If >= 30m and offline: push to local queue instead (see 4.7), still update last-saved-point locally — proper queue is Part 4.7; for now the write is wrapped in try/catch, `lastSavedPoint` updates regardless of write success, and a failure is `console.error`'d instead of crashing
- [x] If < 30m: skip, no write — unchanged from 4.4/4.5, `shouldSaveLocation` gates both the path append and the Firestore write
- [x] Home list: `onSnapshot` on `locations` where `riderId == currentUser.uid`, ordered `timestamp desc` — `subscribeToLocationLogs()` in `firestoreService.ts`, subscribed from `HomeScreen`'s `useEffect` on `user.uid`
- [x] Loading / empty / error states; pull-to-refresh — `logsLoading`/`logsError` states, `FlatList`'s `ListEmptyComponent` for "No logs yet", `RefreshControl` re-subscribes the listener (via a `logsRefreshKey` bump) since `onSnapshot` is already real-time
- [x] Each row: formatted timestamp, lat/lng, distance from previous point — `formatLogTimestamp()` (time-only if today, otherwise date + time), lat/lng to 5 decimal places, `distanceMoved` rounded to the nearest metre

> `saveLocationLog`/`subscribeToLocationLogs` only wire into the **background service's** save decision (`locationService.ts`), not the foreground `watchPosition` — per 4.5's consolidation, the foreground watch only moves the live marker and no longer runs its own threshold check, so there's a single source of truth for what gets saved (matches the brief: saving only happens while On Duty).
>
> Not yet re-verified end-to-end on device in this session (On Duty → move 30m+ → confirm Firestore write in console + Home list updates in real time) — needs the native rebuild from 4.5 first.

### 4.7 — Offline Queue
- [x] `src/services/offlineQueue.ts`: AsyncStorage-backed array of pending entries (key `pending_locations`) — `enqueueLocation()` assigns a unique `local_${Date.now()}_${random}` id, reads the existing array, appends, writes the whole array back; `getQueuedLocations()` / `removeQueuedLocation(localId)` round it out
- [x] `NetInfo.addEventListener` (`startOfflineQueueSync()`) — on regaining connectivity, `flushQueuedLocations()` walks the queue in order and writes each to Firestore, removing an entry only after its write is confirmed; on a failed write it stops (keeps the rest queued in order) rather than skipping ahead
- [x] Guard against duplicate writes if sync runs twice — an `isFlushing` module flag prevents overlapping flush runs, and each flushed entry is written via `saveLocationLogWithId(entry.localId, ...)` (a `setDoc` at that specific document id, not `addDoc`) so even a retry after a crash between "write succeeded" and "removed from queue" just overwrites the same document instead of creating a duplicate
- [x] Wired into the Part 4.6 save path: when `saveLocationLog()` throws in `locationService.ts` (offline or any other Firestore error), the point is `enqueueLocation()`-ed instead of dropped; `startLocationTracking()` also flushes once immediately (catches up on anything stranded from a previous session) and starts the connectivity listener; `stopLocationTracking()` stops it

> Timestamp accuracy: online saves use `serverTimestamp()`; queued saves instead store `capturedAt` (client `Date.now()` at the moment the fix was taken) and write it via `Timestamp.fromMillis()` on flush, so a point captured offline still sorts by when it actually happened rather than when it happened to sync.
>
> Not yet verified end-to-end on device (needs the native rebuild from 4.5/4.6 first) — e.g. toggling airplane mode On Duty, confirming a log queues, then reconnecting and confirming it syncs into Firestore/Home list exactly once.

---

## Deliverables Checklist
- [ ] Source code pushed to GitHub, meaningful commit history (one commit minimum per Part/sub-task)
- [ ] README.md covering: Firebase setup w/ placeholder config, background-location approach + why (esp. why not the paid SDK), permission request/handling flow, offline-queue/sync strategy, setup/run instructions
- [ ] Screen recording: On Duty → device moves across 30m threshold (real or mock GPS) → new log appears in Firestore console + home list → app backgrounded and tracking still works
- [ ] At least one passing automated test for distance/threshold logic including a 30m boundary case

## Acceptance Criteria (self-check before submission)
- [ ] Tracking genuinely continues when app is backgrounded/minimized, not just foregrounded
- [ ] No Firestore write for movements under 30m
- [ ] Haversine (not flat lat/lng delta) used for distance
- [ ] Network loss mid-tracking → entries queue → reconnect syncs with no duplicates, no loss
- [ ] Permission denial doesn't crash the app or silently fail — user sees a clear message
- [ ] App builds and runs via `npx react-native run-android` from a clean clone (aside from placeholder Firebase config)

---

## Current Status
- Part 1 (Project Setup): done (folder structure now includes `src/screens`, `src/services`, `src/context`, `src/types` — `src/utils` and remaining Part 4 service files still to come)
- Part 2 (Firebase Setup): done, build not yet verified with `./gradlew clean && npx react-native run-android`
- Part 3 (Firebase Login): done — signup → restart → still-logged-in → logout flow tested and confirmed working on device.
- Part 4 (Geolocation): 4.1–4.4 done and previously device-verified (map, live foreground tracking, Haversine + 30m threshold). 4.5 (On Duty Toggle + Background Service) code complete — background service running the 10s polling loop, event bridge back to the UI. 4.6 (Firestore Save + Home List) code complete — `firestoreService.ts` (`saveLocationLog`/`subscribeToLocationLogs`), background save decision writes to Firestore, "Recent Logs" wired to a real `onSnapshot` list with loading/empty/error states + pull-to-refresh. 4.7 (Offline Queue) code complete — `offlineQueue.ts` now catches a failed/offline save from 4.6 instead of just logging it, persists it to AsyncStorage with a unique local id, and a `NetInfo` listener flushes the queue (idempotent via `setDoc` at that id) as soon as connectivity returns. All of 4.5–4.7 are type-checked and lint-clean but **still need the full native rebuild** (`gradlew clean` + reinstall) before any of it has been exercised on-device — background execution, Firestore writes, and offline queuing/sync are all unverified end-to-end in this session. `__tests__/App.test.tsx` remains failing for the unrelated, pre-existing Jest/`@react-navigation` ESM issue noted earlier; `distanceUtils.test.ts` (7/7) is unaffected.
