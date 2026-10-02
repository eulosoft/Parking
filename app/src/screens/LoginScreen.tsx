import React, {useState} from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import {API_BASE_URL, setAuthToken, setCurrentUser} from '../services/api';

type LoginScreenProps = {
  onLoginSuccess: (user: { id: string; name: string; email: string }) => void;
};

export default function LoginScreen({onLoginSuccess}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password}),
      });

      const rawBody = await response.text();
      let data: any = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseError) {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.message || `No se pudo completar la acción (HTTP ${response.status})`);
      }

      if (!data.token || !data.user) {
        throw new Error('La respuesta del servidor no incluyó la sesión. Intenta de nuevo.');
      }

      await setAuthToken(data.token);
      await setCurrentUser(data.user);
      onLoginSuccess(data.user);
    } catch (e: any) {
      const message =
        e?.message === 'Failed to fetch' || e?.message === 'Network request failed'
          ? `No hay conexión con el servidor (${API_BASE_URL}). Verifica que la API esté ejecutándose.`
          : e?.message || 'Error al autenticar';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../../assets/parking-logo.png')} style={styles.logo} />
        <Text style={styles.eyebrow}>Parking</Text>
        <Text style={styles.title}>Acceso de administrador</Text>
        <Text style={styles.subtitle}>
          Inicia sesión para gestionar los vehículos y los servicios de parqueadero.
        </Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            style={styles.input}
          />
        </View>

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
          <Text style={styles.primaryButtonText}>
            {loading ? 'Validando...' : 'Entrar'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef4ff',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  eyebrow: {
    color: '#5b69ff',
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#101828',
    marginTop: 10,
  },
  subtitle: {
    color: '#475467',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 22,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    color: '#344054',
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  errorText: {
    color: '#991b1b',
    fontWeight: '600',
  },
});
