import { Alert, PermissionsAndroid, Platform } from 'react-native';

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (alreadyGranted) {
      return true;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'MapTask needs access to your location to track deliveries.',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      },
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Requests "Allow all the time" background location access. Android requires
 * foreground location (ACCESS_FINE_LOCATION) to already be granted before this
 * can be requested — the system silently rejects it otherwise.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const hasForeground = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (!hasForeground) {
    return false;
  }

  try {
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    if (alreadyGranted) {
      return true;
    }

    const wantsToProceed = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Background Location Needed',
        'To keep tracking your deliveries while MapTask is minimized, please choose "Allow all the time" on the next screen.',
        [
          { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ],
      );
    });

    if (!wantsToProceed) {
      return false;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title: 'Background Location Permission',
        message:
          'MapTask needs background location access to keep tracking deliveries while the app is minimized.',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      },
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
