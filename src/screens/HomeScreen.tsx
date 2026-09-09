import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import type { Timestamp } from '@react-native-firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { logOut } from '../services/authService';
import { requestBackgroundLocationPermission, requestLocationPermission } from '../utils/permissions';
import {
  LOCATION_UPDATE_EVENT,
  startLocationTracking,
  stopLocationTracking,
  type LocationUpdatePayload,
} from '../services/locationService';
import { subscribeToLocationLogs, type LocationLog } from '../services/firestoreService';
import { colors, radius, shadow, spacing } from '../theme';

function formatLogTimestamp(timestamp: Timestamp | null): string {
  if (!timestamp) {
    return 'Just now';
  }
  const date = timestamp.toDate();
  const isToday = date.toDateString() === new Date().toDateString();
  return date.toLocaleString('en-US', {
    month: isToday ? undefined : 'short',
    day: isToday ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type Coordinates = {
  latitude: number;
  longitude: number;
};

function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const [pathCoords, setPathCoords] = useState<Coordinates[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(null);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [locationLogs, setLocationLogs] = useState<LocationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let watchId: number | null = null;
    // Permanent verification counter — do not remove. Confirms the
    // foreground marker's own watchPosition stream is actually firing,
    // independent of the background/official tracking pipeline's own
    // [Tracking] log in locationService.ts.
    let markerFixCount = 0;

    const fetchInitialPosition = (enableHighAccuracy: boolean) => {
      const attempt = enableHighAccuracy ? 'GPS (high accuracy)' : 'network (low accuracy)';
      console.log(`[Geolocation] Requesting initial position via ${attempt}...`);

      Geolocation.getCurrentPosition(
        position => {
          if (!isMounted) {
            return;
          }
          console.log(`[Geolocation] Initial fix via ${attempt}:`, position.coords);
          const origin: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setPathCoords([origin]);
          setCurrentPosition(origin);
        },
        error => {
          if (!isMounted) {
            return;
          }
          console.warn(
            `[Geolocation] Error via ${attempt} — code=${error.code} message=${error.message}`,
          );
          if (enableHighAccuracy) {
            // GPS fix failed/timed out — fall back to network-based location, which
            // works indoors and where a GPS lock is slow or unavailable.
            fetchInitialPosition(false);
            return;
          }
          setLocationErrorMessage('Unable to fetch location');
        },
        { enableHighAccuracy, timeout: 15000, maximumAge: 10000 },
      );
    };

    const startWatching = () => {
      // Foreground-only: keeps the live marker moving while the screen is
      // open. It no longer decides what gets "saved" — once On Duty, that's
      // the background service's job (locationService.ts) via the event
      // listener below, so tracking keeps working when the app is minimized.
      watchId = Geolocation.watchPosition(
        position => {
          if (!isMounted) {
            return;
          }
          const point: Coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          markerFixCount += 1;
          console.log(
            `[Tracking] Marker fix #${markerFixCount} lat=${point.latitude} lng=${point.longitude} ` +
              `time=${new Date().toLocaleTimeString()}`,
          );
          setCurrentPosition(point);
        },
        error => {
          if (!isMounted) {
            return;
          }
          console.warn(
            `[Geolocation] watchPosition error — code=${error.code} message=${error.message}`,
          );
          // A transient watch error shouldn't wipe the path/marker already on screen.
        },
        { enableHighAccuracy: false, distanceFilter: 0, interval: 10000, fastestInterval: 5000 },
      );
    };

    (async () => {
      const granted = await requestLocationPermission();
      console.log('[Geolocation] Permission granted:', granted);
      if (!isMounted) {
        return;
      }

      if (!granted) {
        setLocationErrorMessage('Location permission required to show your position');
        return;
      }

      fetchInitialPosition(true);
      startWatching();
    })();

    return () => {
      isMounted = false;
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    if (pathCoords.length > 0) {
      mapRef.current?.fitToCoordinates(pathCoords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [pathCoords]);

  useEffect(() => {
    // "Official" tracking data — the On Duty background service (locationService.ts)
    // emits one of these per fix, whether the app is foregrounded or minimized.
    // Only threshold-crossing points get appended to the trail.
    const subscription = DeviceEventEmitter.addListener(
      LOCATION_UPDATE_EVENT,
      (payload: LocationUpdatePayload) => {
        setCurrentPosition(payload.point);
        if (payload.saved) {
          setPathCoords(prev => [...prev, payload.point]);
        }
      },
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setLocationLogs([]);
      setLogsLoading(false);
      return;
    }

    setLogsLoading(true);
    setLogsError(null);

    const unsubscribe = subscribeToLocationLogs(
      user.uid,
      logs => {
        setLocationLogs(logs);
        setLogsLoading(false);
        setLogsError(null);
        setRefreshingLogs(false);
      },
      error => {
        setLogsError(error.message || 'Could not load location logs.');
        setLogsLoading(false);
        setRefreshingLogs(false);
      },
    );

    return unsubscribe;
  }, [user?.uid, logsRefreshKey]);

  const handleRefreshLogs = () => {
    setRefreshingLogs(true);
    setLogsRefreshKey(prev => prev + 1);
  };

  const handleToggleDuty = async (nextValue: boolean) => {
    if (togglingDuty) {
      return;
    }
    setTogglingDuty(true);

    if (nextValue) {
      const granted = await requestBackgroundLocationPermission();
      if (!granted) {
        Alert.alert(
          'Permission required',
          'Background location access is needed to keep tracking deliveries while the app is minimized.',
        );
        setTogglingDuty(false);
        return;
      }

      try {
        await startLocationTracking();
        setIsOnDuty(true);
      } catch (error: any) {
        Alert.alert('Could not go On Duty', error.message ?? 'Please try again.');
      } finally {
        setTogglingDuty(false);
      }
    } else {
      try {
        await stopLocationTracking();
      } finally {
        setIsOnDuty(false);
        setTogglingDuty(false);
      }
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await stopLocationTracking();
      setIsOnDuty(false);
      await logOut();
    } catch (error: any) {
      Alert.alert('Logout failed', error.message);
      setLoggingOut(false);
    }
  };

  const initial = user?.email ? user.email.charAt(0).toUpperCase() : '?';
  const hasPath = pathCoords.length > 0;
  const startPoint = pathCoords[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.greeting}>Hi there 👋</Text>
              <Text style={styles.email} numberOfLines={1}>
                {user?.email ?? ''}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            activeOpacity={0.8}
            disabled={loggingOut}>
            {loggingOut ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.logoutText}>Logout</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.dutyCard}>
          <View style={styles.dutyTextGroup}>
            <Text style={styles.dutyTitle}>{isOnDuty ? 'On Duty' : 'Off Duty'}</Text>
            <Text style={styles.dutySubtitle}>
              {isOnDuty
                ? 'Tracking your location, even while minimized'
                : 'Turn on to start tracking deliveries'}
            </Text>
          </View>
          {togglingDuty ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Switch
              value={isOnDuty}
              onValueChange={handleToggleDuty}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={isOnDuty ? colors.primary : colors.surface}
            />
          )}
        </View>

        <Text style={styles.sectionLabel}>Live Location</Text>
        <View style={styles.mapCard}>
          {hasPath ? (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={{
                latitude: startPoint.latitude,
                longitude: startPoint.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}>
              {pathCoords.length >= 2 && (
                <Polyline coordinates={pathCoords} strokeWidth={4} strokeColor="#2196F3" />
              )}
              <Marker
                coordinate={startPoint}
                title={pathCoords.length >= 2 ? 'Start' : 'Current Position'}
                pinColor={pathCoords.length >= 2 ? 'green' : 'red'}
              />
              {pathCoords.length >= 2 && currentPosition && (
                <Marker coordinate={currentPosition} title="Current Position" pinColor="red" />
              )}
            </MapView>
          ) : (
            <View style={styles.mapFallback}>
              {locationErrorMessage ? (
                <>
                  <Text style={styles.fallbackIcon}>📍</Text>
                  <Text style={styles.fallbackText}>{locationErrorMessage}</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.fallbackText}>Fetching your location…</Text>
                </>
              )}
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Recent Logs</Text>

        {logsLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptySubtitle}>Loading logs…</Text>
          </View>
        ) : logsError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.fallbackIcon}>⚠️</Text>
            <Text style={styles.emptyTitle}>Couldn't load logs</Text>
            <Text style={styles.emptySubtitle}>{logsError}</Text>
          </View>
        ) : (
          <FlatList
            style={styles.logsList}
            data={locationLogs}
            keyExtractor={item => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshingLogs}
                onRefresh={handleRefreshLogs}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.fallbackIcon}>🗒️</Text>
                <Text style={styles.emptyTitle}>No logs yet</Text>
                <Text style={styles.emptySubtitle}>Location log list will appear here</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.logRow}>
                <View style={styles.logRowMain}>
                  <Text style={styles.logCoords}>
                    {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                  </Text>
                  <Text style={styles.logTimestamp}>{formatLogTimestamp(item.timestamp)}</Text>
                </View>
                <Text style={styles.logDistance}>
                  {Math.round(item.distanceMoved)}m from previous
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadow.button,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  identityText: {
    flexShrink: 1,
  },
  greeting: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  email: {
    color: colors.primaryLight,
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    minWidth: 84,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  dutyTextGroup: {
    flexShrink: 1,
    marginRight: spacing.md,
  },
  dutyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dutySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionLabelSpaced: {
    marginTop: spacing.lg,
  },
  mapCard: {
    width: '100%',
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  fallbackIcon: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  fallbackText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  logsList: {
    flex: 1,
  },
  logRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  logRowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logCoords: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  logTimestamp: {
    fontSize: 12,
    color: colors.textMuted,
  },
  logDistance: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default HomeScreen;
