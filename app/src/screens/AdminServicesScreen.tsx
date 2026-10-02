import React, {useCallback, useEffect, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LoadingScreen from '../components/LoadingScreen';
import {getVehicles, setVehicleServiceState} from '../services/api';

type AdminVehicle = {
  id: string;
  plate: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  owner?: {name: string; email: string} | null;
  service?: {
    isActive: boolean;
    status: string;
    dateEnd: string;
    daysRemaining: number;
  } | null;
};

const formatDate = (value?: string) => {
  if (!value) {
    return 'Sin fecha';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-CO');
};

export default function AdminServicesScreen() {
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingVehicleId, setUpdatingVehicleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    try {
      const currentVehicles = await getVehicles();
      setVehicles(currentVehicles);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const changeServiceState = async (vehicle: AdminVehicle, active: boolean) => {
    try {
      setUpdatingVehicleId(vehicle.id);
      setError(null);
      await setVehicleServiceState(vehicle.id, active, 30);
      await loadVehicles();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar el servicio.',
      );
    } finally {
      setUpdatingVehicleId(null);
    }
  };

  if (loading) {
    return <LoadingScreen message="Conectando con el backend..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadVehicles();
            }}
            colors={['#2563eb']}
            tintColor="#2563eb"
          />
        }
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Administración</Text>
        <Text style={styles.title}>Servicios de parqueadero</Text>
        <Text style={styles.subtitle}>
          Activa manualmente por 30 días o inactiva el servicio de cada vehículo.
        </Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No hay vehículos registrados</Text>
            <Text style={styles.emptyText}>
              Registra un vehículo en la pestaña Vehículos para administrar su servicio.
            </Text>
          </View>
        ) : (
          vehicles.map(vehicle => {
            const active = Boolean(vehicle.service?.isActive);
            const updating = updatingVehicleId === vehicle.id;
            return (
              <View key={vehicle.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.plate}>{vehicle.plate}</Text>
                    <Text style={styles.vehicleType}>
                      {vehicle.type === 'CAR' ? 'Automóvil' : 'Motocicleta'}
                      {vehicle.brand ? ` · ${vehicle.brand}` : ''}
                      {vehicle.model ? ` ${vehicle.model}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextInactive]}>
                      {active
                        ? vehicle.service?.status === 'PENDING'
                          ? 'POR VENCER'
                          : 'ACTIVO'
                        : 'INACTIVO'}
                    </Text>
                  </View>
                </View>

                {vehicle.owner ? (
                  <Text style={styles.owner}>
                    {vehicle.owner.name} · {vehicle.owner.email}
                  </Text>
                ) : null}
                {active ? (
                  <Text style={styles.expiration}>
                    Vence: {formatDate(vehicle.service?.dateEnd)} ·{' '}
                    {vehicle.service?.daysRemaining ?? 0} días restantes
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={updating || (active && !vehicle.service)}
                  onPress={() => changeServiceState(vehicle, !active)}
                  style={[
                    styles.actionButton,
                    active ? styles.deactivateButton : styles.activateButton,
                    updating && styles.buttonDisabled,
                  ]}>
                  <Text style={styles.actionText}>
                    {updating
                      ? 'Actualizando...'
                      : active
                        ? 'Inactivar servicio'
                        : 'Activar por 30 días'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#eef4ff'},
  content: {paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32},
  eyebrow: {
    color: '#5b69ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {color: '#101828', fontSize: 27, fontWeight: '800', marginTop: 5},
  subtitle: {color: '#475467', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18},
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    elevation: 3,
    marginBottom: 14,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardHeader: {alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between'},
  vehicleInfo: {flex: 1, marginRight: 8},
  plate: {color: '#111827', fontSize: 18, fontWeight: '800'},
  vehicleType: {color: '#64748b', fontSize: 13, marginTop: 3},
  badge: {borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5},
  badgeActive: {backgroundColor: '#dcfce7'},
  badgeInactive: {backgroundColor: '#f1f5f9'},
  badgeText: {fontSize: 10, fontWeight: '800'},
  badgeTextActive: {color: '#15803d'},
  badgeTextInactive: {color: '#64748b'},
  owner: {color: '#475467', fontSize: 12, marginTop: 12},
  expiration: {color: '#1d4ed8', fontSize: 13, fontWeight: '600', marginTop: 10},
  actionButton: {alignItems: 'center', borderRadius: 10, marginTop: 16, paddingVertical: 13},
  activateButton: {backgroundColor: '#2563eb'},
  deactivateButton: {backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderWidth: 1},
  buttonDisabled: {opacity: 0.55},
  actionText: {color: '#1e3a8a', fontSize: 14, fontWeight: '800'},
  errorCard: {backgroundColor: '#fee2e2', borderRadius: 12, marginBottom: 14, padding: 14},
  errorText: {color: '#991b1b', fontWeight: '600'},
  emptyCard: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, padding: 24},
  emptyTitle: {color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 8},
  emptyText: {color: '#475467', lineHeight: 22, textAlign: 'center'},
});
