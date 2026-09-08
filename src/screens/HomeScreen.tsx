import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { useAuth } from '../context/AuthContext';
import { logOut } from '../services/authService';
import { requestLocationPermission } from '../utils/permissions';

type Coordinates = {
  latitude: number;
  longitude: number;
};

function HomeScreen() {
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPosition = (enableHighAccuracy: boolean) => {
      Geolocation.getCurrentPosition(
        position => {
          if (!isMounted) {
            return;
          }
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        error => {
          if (!isMounted) {
            return;
          }
          console.warn('Geolocation error:', error.code, error.message);
          if (enableHighAccuracy) {
            // GPS fix failed/timed out — fall back to network-based location, which
            // works indoors and where a GPS lock is slow or unavailable.
            fetchPosition(false);
            return;
          }
          setLocationErrorMessage('Unable to fetch location');
        },
        { enableHighAccuracy, timeout: 15000, maximumAge: 10000 },
      );
    };

    (async () => {
      const granted = await requestLocationPermission();
      if (!isMounted) {
        return;
      }

      if (!granted) {
        setLocationErrorMessage('Location permission required to show your position');
        return;
      }

      fetchPosition(true);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logOut();
    } catch (error: any) {
      Alert.alert('Logout failed', error.message);
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome} numberOfLines={1}>
          Welcome{user?.email ? `, ${user.email}` : ''}
        </Text>
        <TouchableOpacity
          style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}>
          {loggingOut ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.logoutText}>Logout</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        {currentLocation ? (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}>
            <Marker coordinate={currentLocation} title="You are here" />
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            {locationErrorMessage ? (
              <Text style={styles.placeholderText}>{locationErrorMessage}</Text>
            ) : (
              <ActivityIndicator size="large" />
            )}
          </View>
        )}
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Location log list will appear here</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  welcome: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 12,
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 74,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
  },
  mapContainer: {
    width: '100%',
    height: 320,
    backgroundColor: '#eee',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default HomeScreen;
