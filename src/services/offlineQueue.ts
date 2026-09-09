import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { saveLocationLogWithId } from './firestoreService';

const QUEUE_STORAGE_KEY = 'pending_locations';

export type QueuedLocationEntry = {
  localId: string;
  riderId: string;
  lat: number;
  lng: number;
  distanceMoved: number;
  capturedAt: number;
};

export type NewQueuedLocationEntry = Omit<QueuedLocationEntry, 'localId' | 'capturedAt'>;

export async function getQueuedLocations(): Promise<QueuedLocationEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    console.error('[OfflineQueue] Failed to read queue:', error?.message ?? error);
    return [];
  }
}

async function saveQueuedLocations(entries: QueuedLocationEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(entries));
}

export async function enqueueLocation(
  entry: NewQueuedLocationEntry,
): Promise<QueuedLocationEntry> {
  const queued: QueuedLocationEntry = {
    ...entry,
    localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    capturedAt: Date.now(),
  };

  const existing = await getQueuedLocations();
  await saveQueuedLocations([...existing, queued]);
  console.log(`[OfflineQueue] Queued ${queued.localId} (${existing.length + 1} pending)`);
  return queued;
}

export async function removeQueuedLocation(localId: string): Promise<void> {
  const existing = await getQueuedLocations();
  await saveQueuedLocations(existing.filter(item => item.localId !== localId));
}

// Guards against two flush runs (e.g. two NetInfo events firing close
// together, or a manual flush overlapping the listener's flush) processing
// the same queued entries concurrently.
let isFlushing = false;

export async function flushQueuedLocations(): Promise<void> {
  if (isFlushing) {
    return;
  }
  isFlushing = true;

  try {
    const pending = await getQueuedLocations();
    if (pending.length === 0) {
      return;
    }
    console.log(`[OfflineQueue] Flushing ${pending.length} queued location(s)...`);

    for (const entry of pending) {
      try {
        // Writing at the entry's own localId makes this idempotent: if a
        // previous flush wrote the document but crashed before removing it
        // from the queue, retrying overwrites the same document instead of
        // creating a duplicate.
        await saveLocationLogWithId(
          entry.localId,
          entry.riderId,
          entry.lat,
          entry.lng,
          entry.distanceMoved,
          entry.capturedAt,
        );
        await removeQueuedLocation(entry.localId);
        console.log(`[OfflineQueue] Synced ${entry.localId}`);
      } catch (error: any) {
        console.error(
          `[OfflineQueue] Failed to sync ${entry.localId}, will retry later:`,
          error?.message ?? error,
        );
        // Stop here so remaining entries stay queued in their original order
        // for the next attempt, rather than skipping ahead out of order.
        break;
      }
    }
  } finally {
    isFlushing = false;
  }
}

let unsubscribeNetInfo: (() => void) | null = null;

export function startOfflineQueueSync(): void {
  if (unsubscribeNetInfo) {
    return;
  }
  unsubscribeNetInfo = NetInfo.addEventListener(state => {
    if (state.isConnected) {
      flushQueuedLocations();
    }
  });
}

export function stopOfflineQueueSync(): void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
}
