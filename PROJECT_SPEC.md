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
- [ ] Static/dummy array of lat-lng test points → render as `Polyline` on the map
- [ ] Start marker (pickup/user) + end marker (rider/current)
- [ ] Structure the coordinates as state so new points can be appended dynamically later

### 4.3 — Live Foreground Tracking
- [ ] `Geolocation.watchPosition` for live foreground updates (background comes later, in 4.5)
- [ ] On each fix: move marker, append point to the `Polyline` coordinates
- [ ] Confirms map + live movement works correctly at the UI level before background complexity is added

### 4.4 — Distance Logic
- [ ] `distanceUtils.ts`: Haversine formula, returns meters between two lat/lng points
- [ ] `shouldSaveLocation(lastSaved, current, thresholdMeters = 30): boolean`
- [ ] `__tests__/distanceUtils.test.ts` — normal case + boundary cases (29m → false, 30m → true, 31m → true)
- [ ] Wire into the 4.3 flow: only mark a point as "confirmed/saved" in the path once threshold is crossed

### 4.5 — On Duty Toggle + Background Service
- [ ] On Duty / Off Duty toggle UI on Home screen
- [ ] Request `ACCESS_BACKGROUND_LOCATION` (Android 10+) with rationale dialog, after foreground permission already granted
- [ ] Add `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (API 34+) to manifest
- [ ] Foreground service (`react-native-background-actions` or equivalent) with persistent notification ("Rider is On Duty")
- [ ] 10-second polling loop runs inside the service — verify it keeps firing with app minimized/backgrounded, not just foregrounded
- [ ] Off Duty or logout stops the service cleanly
- [ ] Permission denial → toggle stays disabled, clear message shown, no crash

### 4.6 — Firestore Save + Home List
- [ ] On each background fix, run 4.4's threshold check against last **saved** point
- [ ] If >= 30m and online: write `{ riderId, lat, lng, timestamp, distanceMoved }` to Firestore, update last-saved-point
- [ ] If >= 30m and offline: push to local queue instead (see 4.7), still update last-saved-point locally
- [ ] If < 30m: skip, no write
- [ ] Home list: `onSnapshot` on `locations` where `riderId == currentUser.uid`, ordered `timestamp desc`
- [ ] Loading / empty / error states; pull-to-refresh
- [ ] Each row: formatted timestamp, lat/lng, distance from previous point

### 4.7 — Offline Queue
- [ ] `offlineQueue.ts`: AsyncStorage-backed array of pending entries, each with a unique local id
- [ ] `NetInfo.addEventListener` — on regaining connectivity, flush queue to Firestore one by one, remove from queue only after confirmed write
- [ ] Guard against duplicate writes if sync runs twice (idempotent id use)

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
- Part 4 (Geolocation): 4.1 (Basic Map + Current Location) code complete — permissions.ts, MapView + Marker on HomeScreen, current-location fetch with fallback states, all type-checked. Not yet verified on device in this session. 4.2 onward not started.
