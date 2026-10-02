import React, {useEffect, useState} from 'react';
import {SafeAreaView, StyleSheet, Text, Pressable, View} from 'react-native';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onMessage,
  requestPermission,
} from '@react-native-firebase/messaging';
import AdminServicesScreen from './src/screens/AdminServicesScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import LoginScreen from './src/screens/LoginScreen';
import VehiclesScreen from './src/screens/VehiclesScreen';
import LoadingScreen from './src/components/LoadingScreen';
import {clearSession, getStoredAuthToken, validateSession, registerDeviceToken} from './src/services/api';
import {signOutFirebase} from './src/services/auth';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; email: string; role?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'vehicles' | 'history'>('home');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await getStoredAuthToken();
        if (token) {
          const currentUser = await validateSession();
          setUser(currentUser);
          setIsAuthenticated(true);
        }
      } catch {
        await clearSession();
      } finally {
        setIsReady(true);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'ADMIN') {
      return;
    }

    const registerForNotifications = async () => {
      try {
        const messagingInstance = getMessaging();
        const authStatus = await requestPermission(messagingInstance);
        const enabled =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
          return;
        }

        const fcmToken = await getToken(messagingInstance);
        if (fcmToken) {
          await registerDeviceToken(fcmToken);
        }
      } catch (error) {
        console.log('Firebase push registration failed', error);
      }
    };

    registerForNotifications();

    const unsubscribe = onMessage(getMessaging(), () => {});

    return unsubscribe;
  }, [isAuthenticated, user?.role]);

  const handleLoginSuccess = (loggedUser: { id: string; name: string; email: string; role?: string }) => {
    setUser(loggedUser);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await signOutFirebase();
    } catch (error) {
      console.warn('Firebase sign-out failed', error);
    } finally {
      await clearSession();
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  if (!isReady) {
    return <LoadingScreen message="Cargando sesión..." />;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.userBar}>
        <View style={styles.userInfo}>
          <Text style={styles.userGreeting}>Bienvenido,</Text>
          <Text style={styles.userText}>{user?.name || 'Usuario'}</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={styles.screenContainer}>
        {user?.role !== 'ADMIN' ? (
          <View style={styles.pendingAccess}>
            <Text style={styles.pendingTitle}>Cuenta creada correctamente</Text>
            <Text style={styles.pendingMessage}>
              Tu sesión está activa. Las funciones para cuentas de usuario estarán disponibles próximamente.
            </Text>
          </View>
        ) : activeTab === 'home' ? (
          <AdminServicesScreen />
        ) : activeTab === 'vehicles' ? (
          <VehiclesScreen user={user!} />
        ) : (
          <HistoryScreen onBackToHome={() => setActiveTab('home')} />
        )}
      </View>

      {user?.role === 'ADMIN' ? (
        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => setActiveTab('home')}
            style={[styles.bottomTab, activeTab === 'home' && styles.bottomTabActive]}
          >
            <Text style={styles.tabIcon}>🏠</Text>
            <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>Inicio</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('vehicles')}
            style={[styles.bottomTab, activeTab === 'vehicles' && styles.bottomTabActive]}
          >
            <Text style={styles.tabIcon}>🚗</Text>
            <Text style={[styles.tabText, activeTab === 'vehicles' && styles.tabTextActive]}>Vehículos</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('history')}
            style={[styles.bottomTab, activeTab === 'history' && styles.bottomTabActive]}
          >
            <Text style={styles.tabIcon}>📄</Text>
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Historial</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef4ff',
  },
  screenContainer: {
    flex: 1,
  },
  pendingAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pendingTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  pendingMessage: {
    color: '#475467',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  userBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  userInfo: {
    flexDirection: 'column',
  },
  userGreeting: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userText: {
    fontWeight: '800',
    color: '#0f172a',
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 10,
  },
  bottomTab: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabActive: {
    backgroundColor: '#eff6ff',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '800',
  },
});
