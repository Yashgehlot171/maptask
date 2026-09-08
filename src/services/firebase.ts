import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

export const auth = getAuth(getApp());