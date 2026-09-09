import { DeviceEventEmitter } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import { getDistanceInMeters, shouldSaveLocation, type LatLng } from './distanceUtils';
import { auth } from './firebase';
import { saveLocationLog } from './firestoreService';
import {
  enqueueLocation,
  flushQueuedLocations,
  startOfflineQueueSync,
  stopOfflineQueueSync,
} from './offlineQueue';

export const LOCATION_UPDATE_EVENT = 'MapTask:locationUpdate';

export type LocationUpdatePayload = {
  point: LatLng;
  saved: boolean;
  distanceFromLastSaved: number;
};

const POLL_INTERVAL_MS = 10000;

// Module-level (not React state) — this is the background task's own memory of
// what it last saved, independent of anything happening in HomeScreen's UI.
let lastSavedPoint: LatLng | null = null;

// Permanent verification counter/log for processLocationFix — do not remove.
// A single console line per fix, in a fixed format, so a future test session
// only needs one console check to confirm the pipeline is alive: is the
// counter incrementing roughly every 10s, and is `distance`/`saved` correct.
let fixCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getNextFix(): Promise<LatLng | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      error => {
        console.warn(
          `[BackgroundLocation] Error — code=${error.code} message=${error.message}`,
        );
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 },
    );
  });
}

// Shared by the real tracking loop below AND by HomeScreen's __DEV__-only
// test mode (mockLocationTest.ts) — both feed points through this exact same
// threshold + save + UI-event logic, so testing with mock points genuinely
// exercises the real pipeline instead of a parallel copy of it.
export async function processLocationFix(point: LatLng): Promise<void> {
  const distance = lastSavedPoint ? getDistanceInMeters(lastSavedPoint, point) : 0;
  const saved = shouldSaveLocation(lastSavedPoint, point);

  fixCount += 1;
  console.log(
    `[Tracking] Fix #${fixCount} lat=${point.latitude} lng=${point.longitude} ` +
      `distance=${distance.toFixed(1)}m saved=${saved} time=${new Date().toLocaleTimeString()}`,
  );

  console.log(
    `[LocationFix] ${point.latitude}, ${point.longitude} — ` +
      `lastSavedPoint=${
        lastSavedPoint ? `${lastSavedPoint.latitude}, ${lastSavedPoint.longitude}` : 'null'
      } — distance=${distance.toFixed(2)}m — ${saved ? 'SAVED' : 'SKIPPED (under 30m threshold)'}`,
  );

  if (saved) {
    // Update the local threshold tracker regardless of whether the write
    // below succeeds — a failed/offline write shouldn't cause the same
    // point to be re-saved on the next fix.
    lastSavedPoint = point;

    const riderId = auth.currentUser?.uid;
    if (riderId) {
      try {
        await saveLocationLog(riderId, point.latitude, point.longitude, distance);
        console.log(`[LocationFix] Saved to Firestore — distanceMoved=${distance.toFixed(2)}m`);
      } catch (error: any) {
        // Most likely offline (could also be a genuine Firestore error) — either
        // way, don't lose this qualifying point. Queue it locally; it'll sync
        // automatically once connectivity returns (see offlineQueue.ts).
        console.error(
          '[LocationFix] Failed to save location log — queuing for later sync:',
          error?.message ?? error,
        );
        await enqueueLocation({
          riderId,
          lat: point.latitude,
          lng: point.longitude,
          distanceMoved: distance,
        });
      }
    } else {
      console.warn('[LocationFix] No signed-in user — skipping Firestore save.');
    }
  }

  DeviceEventEmitter.emit(LOCATION_UPDATE_EVENT, {
    point,
    saved,
    distanceFromLastSaved: distance,
  } as LocationUpdatePayload);
}

// Dev/test-only: lets HomeScreen's test mode start a mock sequence from a
// clean slate without needing to stop/start the whole background service.
export function resetTrackingState(): void {
  lastSavedPoint = null;
}

// Recommended pattern from react-native-background-actions' own docs: keep
// looping for as long as the service is running, sleeping between fixes.
//
// The whole iteration body is wrapped in try/catch: without it, a single
// unexpected exception (e.g. a native Geolocation call behaving differently
// in a true headless/background context than when the app is foregrounded)
// rejects this async function outright and silently kills the loop after
// just one pass — which also explains why `lastSavedPoint` looked like it
// was never updating: each On Duty toggle was really only ever completing
// one iteration before dying, so it always started fresh from `null`.
async function trackingTask(): Promise<void> {
  let iteration = 0;

  while (BackgroundService.isRunning()) {
    iteration += 1;
    console.log(`[BackgroundLocation] Loop iteration #${iteration} at ${new Date().toISOString()}`);

    try {
      const point = await getNextFix();

      if (point) {
        await processLocationFix(point);
      } else {
        console.warn(`[BackgroundLocation] Fix #${iteration}: no position returned.`);
      }
    } catch (error: any) {
      // Never let one bad iteration kill the whole loop — log it and keep tracking.
      console.error(
        '[BackgroundLocation] Unexpected error in tracking loop iteration:',
        error?.message ?? error,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('[BackgroundLocation] Tracking loop exited (BackgroundService.isRunning() is false).');
}

const BACKGROUND_OPTIONS = {
  taskName: 'Rider Tracking',
  taskTitle: 'Rider is On Duty',
  taskDesc: 'Tracking your location',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#4F46E5',
  foregroundServiceType: ['location'],
};

export async function startLocationTracking(): Promise<void> {
  if (BackgroundService.isRunning()) {
    return;
  }
  lastSavedPoint = null;
  startOfflineQueueSync();
  // Catch up on anything stranded from a previous On Duty session that never
  // got a chance to sync (e.g. app was closed while offline).
  flushQueuedLocations();
  await BackgroundService.start(trackingTask, BACKGROUND_OPTIONS);
}

export async function stopLocationTracking(): Promise<void> {
  if (!BackgroundService.isRunning()) {
    return;
  }
  await BackgroundService.stop();
  stopOfflineQueueSync();
}

export function isLocationTrackingRunning(): boolean {
  return BackgroundService.isRunning();
}
