import React, {useState} from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {loginAdmin} from '../services/api';
import {
  loginWithEmail,
  loginWithFacebook,
  loginWithGoogle,
  loginWithMicrosoft,
  isFacebookSignInConfigured,
  isGoogleSignInConfigured,
  isMicrosoftSignInConfigured,
  registerWithEmail,
  requestPasswordReset,
} from '../services/auth';

type AuthUser = {id: string; name: string; email: string; role?: string};
type LoginScreenProps = {onLoginSuccess: (user: AuthUser) => void};
type ScreenMode = 'login' | 'register' | 'forgot' | 'admin';

export default function LoginScreen({onLoginSuccess}: LoginScreenProps) {
  const [mode, setMode] = useState<ScreenMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runAction = async (action: () => Promise<AuthUser | null | void>) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const user = await action();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la autenticación.');
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode: ScreenMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = () => runAction(async () => {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Escribe un correo electrónico válido.');
    }
    if (mode === 'forgot') {
      await requestPasswordReset(normalizedEmail);
      setNotice('Si existe una cuenta para ese correo, recibirás un enlace para restablecer la contraseña.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 8) {
        throw new Error('La contraseña debe tener al menos 8 caracteres.');
      }
      changeMode('login');
      await registerWithEmail(name, normalizedEmail, password);
      setNotice('Te enviamos un enlace de verificación. Confirma tu correo antes de iniciar sesión.');
      return;
    }
    if (mode === 'admin') {
      return loginAdmin(normalizedEmail, password);
    }
    return loginWithEmail(normalizedEmail, password);
  });

  const title = mode === 'register'
    ? 'Crear cuenta'
    : mode === 'forgot'
      ? 'Restablecer contraseña'
      : mode === 'admin'
        ? 'Acceso de administrador'
        : 'Iniciar sesión';
  const submitText = mode === 'register'
    ? 'Crear cuenta'
    : mode === 'forgot'
      ? 'Enviar enlace'
      : 'Entrar';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/parking-logo.png')} style={styles.logo} />
        <Text style={styles.eyebrow}>Parking</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {mode === 'register'
            ? 'Regístrate para acceder a Parking. Confirma tu correo para activar la cuenta.'
            : mode === 'forgot'
              ? 'Te enviaremos un enlace para cambiar tu contraseña.'
              : mode === 'admin'
                ? 'Ingresa con las credenciales administrativas de Parking.'
                : 'Accede con tu cuenta o crea una nueva para continuar.'}
        </Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {mode === 'register' ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nombre (opcional)</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre"
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.input}
              editable={!loading}
            />
          </View>
        ) : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
            editable={!loading}
          />
        </View>

        {mode !== 'forgot' ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              secureTextEntry
              autoCapitalize="none"
              textContentType={mode === 'register' ? 'newPassword' : 'password'}
              style={styles.input}
              editable={!loading}
            />
          </View>
        ) : null}

        <Pressable
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}>
          <Text style={styles.primaryButtonText}>
            {loading ? 'Procesando...' : submitText}
          </Text>
        </Pressable>

        {mode === 'login' ? (
          <>
            <Pressable onPress={() => changeMode('forgot')} disabled={loading} style={styles.textButton}>
              <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
            {isGoogleSignInConfigured() || isFacebookSignInConfigured() || isMicrosoftSignInConfigured() ? (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o continúa con</Text>
                  <View style={styles.dividerLine} />
                </View>
                {isGoogleSignInConfigured() ? (
                  <SocialButton label="Continuar con Google" onPress={() => runAction(loginWithGoogle)} disabled={loading} />
                ) : null}
                {isFacebookSignInConfigured() ? (
                  <SocialButton label="Continuar con Facebook" onPress={() => runAction(loginWithFacebook)} disabled={loading} />
                ) : null}
                {isMicrosoftSignInConfigured() ? (
                  <SocialButton label="Continuar con Microsoft" onPress={() => runAction(loginWithMicrosoft)} disabled={loading} />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <Pressable
          onPress={() => changeMode(mode === 'register' ? 'login' : 'register')}
          disabled={loading}
          style={styles.textButton}>
          <Text style={styles.linkText}>
            {mode === 'register' ? 'Ya tienes una cuenta? Iniciar sesión' : 'Crear una cuenta'}
          </Text>
        </Pressable>
        {mode === 'forgot' ? (
          <Pressable onPress={() => changeMode('login')} disabled={loading} style={styles.textButton}>
            <Text style={styles.linkText}>Volver al inicio de sesión</Text>
          </Pressable>
        ) : null}
        {mode === 'login' || mode === 'admin' ? (
          <Pressable
            onPress={() => changeMode(mode === 'admin' ? 'login' : 'admin')}
            disabled={loading}
            style={styles.textButton}>
            <Text style={styles.secondaryLinkText}>
              {mode === 'admin' ? 'Usar una cuenta de Parking' : 'Acceso de administrador'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SocialButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[styles.socialButton, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}>
      <Text style={styles.socialButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#eef4ff'},
  content: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28},
  eyebrow: {color: '#5b69ff', fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '700'},
  logo: {width: 96, height: 96, marginBottom: 18},
  title: {fontSize: 30, fontWeight: '800', color: '#101828', marginTop: 10},
  subtitle: {color: '#475467', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22},
  fieldGroup: {marginBottom: 18},
  label: {color: '#344054', fontWeight: '700', marginBottom: 8, fontSize: 14},
  input: {backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#d0d5dd', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827'},
  primaryButton: {backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8},
  primaryButtonText: {color: '#ffffff', fontWeight: '700', fontSize: 16},
  buttonDisabled: {opacity: 0.55},
  socialButton: {backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#d0d5dd'},
  socialButtonText: {color: '#344054', fontWeight: '700', fontSize: 15},
  textButton: {alignItems: 'center', paddingVertical: 12},
  linkText: {color: '#2563eb', fontWeight: '700'},
  secondaryLinkText: {color: '#667085', fontWeight: '600', fontSize: 13},
  divider: {flexDirection: 'row', alignItems: 'center', marginVertical: 10},
  dividerLine: {height: 1, backgroundColor: '#d0d5dd', flex: 1},
  dividerText: {color: '#667085', fontSize: 12, marginHorizontal: 12},
  errorCard: {backgroundColor: '#fee2e2', borderRadius: 12, padding: 14, marginBottom: 18},
  errorText: {color: '#991b1b', fontWeight: '600'},
  noticeCard: {backgroundColor: '#dcfce7', borderRadius: 12, padding: 14, marginBottom: 18},
  noticeText: {color: '#166534', fontWeight: '600'},
});
