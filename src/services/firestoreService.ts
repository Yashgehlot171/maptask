import { getApp } from '@react-native-firebase/app';
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  Timestamp,
  type FirestoreError,
  type Unsubscribe,
} from '@react-native-firebase/firestore';

const db = getFirestore(getApp());

const LOCATIONS_COLLECTION = 'locations';

export type LocationLog = {
  id: string;
  riderId: string;
  lat: number;
  lng: number;
  timestamp: Timestamp | null;
  distanceMoved: number;
};

export async function saveLocationLog(
  riderId: string,
  lat: number,
  lng: number,
  distanceMoved: number,
): Promise<void> {
  await addDoc(collection(db, LOCATIONS_COLLECTION), {
    riderId,
    lat,
    lng,
    timestamp: serverTimestamp(),
    distanceMoved,
  });
}

/**
 * Same write as `saveLocationLog`, but at an explicit document id and with a
 * client-supplied capture time instead of `serverTimestamp()`. Used by the
 * offline queue (`offlineQueue.ts`) when flushing entries that were captured
 * while offline: writing at the entry's own local id makes a retried flush
 * idempotent (it overwrites the same document instead of creating a
 * duplicate), and the original capture time keeps the log chronologically
 * accurate instead of showing when it happened to sync.
 */
export async function saveLocationLogWithId(
  id: string,
  riderId: string,
  lat: number,
  lng: number,
  distanceMoved: number,
  capturedAtMillis: number,
): Promise<void> {
  await setDoc(doc(db, LOCATIONS_COLLECTION, id), {
    riderId,
    lat,
    lng,
    timestamp: Timestamp.fromMillis(capturedAtMillis),
    distanceMoved,
  });
}

export function subscribeToLocationLogs(
  riderId: string,
  onUpdate: (logs: LocationLog[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const locationsQuery = query(
    collection(db, LOCATIONS_COLLECTION),
    where('riderId', '==', riderId),
    orderBy('timestamp', 'desc'),
  );

  return onSnapshot(
    locationsQuery,
    // Without this, a document's serverTimestamp() resolving from its pending
    // (null) placeholder to the real server value doesn't reliably re-notify
    // this listener — the list would keep showing "Just now" for a log even
    // after it's fully synced. This makes that resolution trigger a refresh.
    { includeMetadataChanges: true },
    snapshot => {
      const logs: LocationLog[] = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          riderId: data.riderId,
          lat: data.lat,
          lng: data.lng,
          timestamp: data.timestamp ?? null,
          distanceMoved: data.distanceMoved,
        };
      });
      console.log(
        `[Firestore] Snapshot: ${logs.length} log(s), hasPendingWrites=${snapshot.metadata.hasPendingWrites}`,
        logs.map(log => ({
          id: log.id,
          timestamp: log.timestamp ? log.timestamp.toDate().toISOString() : null,
        })),
      );
      onUpdate(logs);
    },
    error => {
      console.warn('[Firestore] subscribeToLocationLogs error:', error.message);
      onError?.(error);
    },
  );
}
