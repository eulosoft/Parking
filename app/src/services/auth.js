import {authorize} from 'react-native-app-auth';
import Config from 'react-native-config';
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from '@react-native-firebase/auth';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {AccessToken, LoginManager} from 'react-native-fbsdk-next';
import {exchangeFirebaseToken} from './api';

const auth = getAuth();
const microsoftRedirectUrl = 'com.eulosoft.parking.auth://oauth2redirect';

export const isGoogleSignInConfigured = () => Boolean(Config.GOOGLE_WEB_CLIENT_ID?.trim());
export const isFacebookSignInConfigured = () => Boolean(
  Config.FACEBOOK_APP_ID?.trim() && Config.FACEBOOK_CLIENT_TOKEN?.trim(),
);
export const isMicrosoftSignInConfigured = () => Boolean(Config.MICROSOFT_CLIENT_ID?.trim());

const requireFirebaseIdentity = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No se pudo iniciar la sesión de Firebase. Intenta de nuevo.');
  }
  if (!user.email) {
    await signOut(auth);
    throw new Error('El proveedor no compartió una dirección de correo.');
  }
  if (!user.emailVerified) {
    try {
      await sendEmailVerification(user);
    } finally {
      await signOut(auth);
    }
    throw new Error('Confirma tu correo desde el enlace que te enviamos y vuelve a iniciar sesión.');
  }

  try {
    return await exchangeFirebaseToken(await user.getIdToken(true));
  } catch (error) {
    await signOut(auth);
    throw error;
  }
};

export async function registerWithEmail(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    if (name.trim()) {
      await updateProfile(credential.user, {displayName: name.trim()});
    }
    await sendEmailVerification(credential.user);
  } finally {
    await signOut(auth);
  }
}

export async function loginWithEmail(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
  return requireFirebaseIdentity();
}

export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function loginWithGoogle() {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google Sign-In aún no está configurado para esta app.');
  }
  const webClientId = Config.GOOGLE_WEB_CLIENT_ID.trim();
  GoogleSignin.configure({webClientId});
  await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success' || !result.data.idToken) {
    throw new Error('Google no devolvió un token de identidad válido.');
  }
  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(result.data.idToken),
  );
  return requireFirebaseIdentity();
}

export async function loginWithFacebook() {
  if (!isFacebookSignInConfigured()) {
    throw new Error('Facebook Login aún no está configurado para esta app.');
  }
  const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);
  if (result.isCancelled) {
    return null;
  }
  const token = await AccessToken.getCurrentAccessToken();
  if (!token?.accessToken) {
    throw new Error('Facebook no devolvió un token de acceso válido.');
  }
  await signInWithCredential(
    auth,
    FacebookAuthProvider.credential(token.accessToken),
  );
  return requireFirebaseIdentity();
}

export async function loginWithMicrosoft() {
  if (!isMicrosoftSignInConfigured()) {
    throw new Error('Microsoft Sign-In aún no está configurado para esta app.');
  }
  const clientId = Config.MICROSOFT_CLIENT_ID.trim();
  const tenantId = Config.MICROSOFT_TENANT_ID?.trim() || 'common';
  const result = await authorize({
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    clientId,
    redirectUrl: microsoftRedirectUrl,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
    usePKCE: true,
  });
  if (!result.idToken) {
    throw new Error('Microsoft no devolvió un token de identidad válido.');
  }
  const provider = new OAuthProvider('microsoft.com');
  await signInWithCredential(
    auth,
    provider.credential({idToken: result.idToken, accessToken: result.accessToken}),
  );
  return requireFirebaseIdentity();
}

export async function signOutFirebase() {
  const failures = [];
  try {
    await signOut(auth);
  } catch (error) {
    failures.push(error);
  }
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    failures.push(error);
  }
  LoginManager.logOut();
  if (failures.length) {
    throw new Error('No se pudieron cerrar todas las sesiones de proveedores externos.');
  }
}
