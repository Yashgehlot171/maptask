import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type UserCredential,
} from '@react-native-firebase/auth';
import { auth } from './firebase';

export function getFriendlyAuthErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export async function signUp(email: string, password: string): Promise<UserCredential> {
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    throw new Error(getFriendlyAuthErrorMessage(error?.code));
  }
}

export async function logIn(email: string, password: string): Promise<UserCredential> {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    throw new Error(getFriendlyAuthErrorMessage(error?.code));
  }
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}
