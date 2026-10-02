import React, {useEffect, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {getAdminServiceHistory, getVehicles} from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

type HistoryItem = {
  id: string;
  vehicleId?: string;
  planId?: string;
  amount?: number | null;
  status?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  daysRemaining?: number | null;
  vehiclePlate?: string;
  owner?: {name: string; email: string} | null;
};

type Vehicle = {
  id: string;
  plate: string;
  type: string;
  brand?: string | null;
  model?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('es-CO');
};

type HistoryScreenProps = {
  onBackToHome?: () => void;
};

export default function HistoryScreen({onBackToHome}: HistoryScreenProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [servicesResult, vehiclesResult] = await Promise.allSettled([
        getAdminServiceHistory(),
        getVehicles(),
      ]);

      if (servicesResult.status === 'rejected') {
        throw servicesResult.reason;
      }

      setHistory(Array.isArray(servicesResult.value) ? servicesResult.value : []);
      setVehicles(vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : []);
      setError(
        vehiclesResult.status === 'rejected'
          ? 'No fue posible cargar los datos de los vehículos.'
          : null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el historial');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => loadHistory(true);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { label: 'VIGENTE', style: styles.badgeActive, textStyle: styles.badgeTextActive };
      case 'RENEWED':
        return { label: 'RENOVADO', style: styles.badgeRenewed, textStyle: styles.badgeTextRenewed };
      case 'EXPIRED':
        return { label: 'VENCIDO', style: styles.badgeExpired, textStyle: styles.badgeTextExpired };
      default:
        return { label: status || 'ESTADO', style: styles.badgeDefault, textStyle: styles.badgeTextDefault };
    }
  };

  if (loading) {
    return <LoadingScreen message="Cargando historial..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563eb']}
            tintColor="#2563eb"
          />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Parking</Text>
            <Text style={styles.title}>Historial de servicios</Text>
          </View>

          {onBackToHome ? (
            <Pressable style={styles.backButton} onPress={onBackToHome}>
              <Text style={styles.backButtonText}>Inicio</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin servicios registrados aún</Text>
            <Text style={styles.emptyText}>Las activaciones y cambios de estado aparecerán aquí.</Text>
          </View>
        ) : (
          history.map((item) => {
            const vehicle = vehicles.find((entry) => entry.id === item.vehicleId);
            const badge = getStatusBadge(item.status || '');
            const vehicleTitle = vehicle
              ? `${vehicle.plate} (${vehicle.type === 'CAR' ? 'Auto' : 'Moto'})`
              : (item.vehicleId || 'Vehículo');
            const brandModel = vehicle && (vehicle.brand || vehicle.model)
              ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim()
              : null;

            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemTopRow}>
                  <View style={styles.titleContainer}>
                    <Text style={styles.itemTitle}>{item.vehiclePlate || vehicleTitle}</Text>
                    {brandModel ? <Text style={styles.itemBrand}>{brandModel}</Text> : null}
                  </View>
                  <View style={[styles.badgeContainer, badge.style]}>
                    <Text style={[styles.badgeText, badge.textStyle]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={styles.detailsDivider} />

                {item.owner ? (
                  <Text style={styles.itemMeta}>
                    Cliente: <Text style={styles.metaBold}>{item.owner.name} · {item.owner.email}</Text>
                  </Text>
                ) : null}
                <Text style={styles.itemMeta}>Plan: <Text style={styles.metaBold}>{item.planId || 'Servicio manual'}</Text></Text>
                {item.amount != null && item.amount > 0 ? (
                  <Text style={styles.itemMeta}>
                    Monto: <Text style={styles.metaBold}>${Number(item.amount).toLocaleString('es-CO')}</Text>
                  </Text>
                ) : null}
                <Text style={styles.itemMeta}>Fecha inicio: {formatDate(item.dateStart)}</Text>
                <Text style={styles.itemMeta}>Fecha fin: {formatDate(item.dateEnd)}</Text>
                {item.status === 'ACTIVE' ? (
                  <Text style={styles.itemRemaining}>Días restantes: {item.daysRemaining ?? 0}</Text>
                ) : null}
              </View>
            );
          })
        )}
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#5b69ff',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#101828',
    marginTop: 4,
  },
  backButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  backButtonText: {
    color: '#1e40af',
    fontWeight: '700',
    fontSize: 13,
  },
  itemCard: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  itemBrand: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  badgeContainer: {
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
  },
  badgeTextActive: {
    color: '#15803d',
  },
  badgeRenewed: {
    backgroundColor: '#e0e7ff',
  },
  badgeTextRenewed: {
    color: '#3730a3',
  },
  badgeExpired: {
    backgroundColor: '#f1f5f9',
  },
  badgeTextExpired: {
    color: '#64748b',
  },
  badgeDefault: {
    backgroundColor: '#f3f4f6',
  },
  badgeTextDefault: {
    color: '#374151',
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  itemMeta: {
    color: '#475467',
    fontSize: 14,
    lineHeight: 22,
  },
  metaBold: {
    fontWeight: '700',
    color: '#1e293b',
  },
  itemRemaining: {
    marginTop: 6,
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  errorText: {
    color: '#991b1b',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    color: '#475467',
    textAlign: 'center',
    lineHeight: 22,
  },
});
