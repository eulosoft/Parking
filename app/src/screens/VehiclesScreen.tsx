import React, {useEffect, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createVehicle,
  getPendingSyncQueue,
  getVehicles,
  syncPendingActions,
  updateVehicle,
} from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

type VehicleScreenProps = {
  user: { id: string; name: string; email: string };
};

const DEFAULT_FORM = {
  type: 'CAR',
  plate: '',
  brand: '',
  model: '',
  ownerName: '',
  ownerEmail: '',
};

export default function VehiclesScreen({user}: VehicleScreenProps) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const refreshPendingSync = async () => {
    try {
      const queue = await getPendingSyncQueue();
      setPendingSyncCount(queue.length);
    } catch (err) {
      setPendingSyncCount(0);
    }
  };

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const data = await getVehicles();
      setVehicles(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'No se pudieron cargar los vehículos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
    refreshPendingSync();
  }, [user.id]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      const result = await syncPendingActions();
      await loadVehicles();
      await refreshPendingSync();
      setError(
        result.rejectedPurchases > 0
          ? 'Se descartaron solicitudes antiguas de compra; el estado se gestiona manualmente.'
          : null,
      );
    } catch (err) {
      // handled in loadVehicles
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncPending = async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await syncPendingActions();
      await loadVehicles();
      await refreshPendingSync();
      if (result.rejectedPurchases > 0) {
        setError('Se descartaron solicitudes antiguas de compra; el estado se gestiona manualmente.');
      }
    } catch (e: any) {
      setError(e.message || 'Error al sincronizar cambios pendientes');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateVehicle = async () => {
    if (!form.plate.trim()) {
      setError('La placa es obligatoria');
      return;
    }
    if (!form.ownerName.trim() || !form.ownerEmail.trim()) {
      setError('El nombre y correo del propietario son obligatorios');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = {
        userId: user.id,
        type: form.type,
        plate: form.plate.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim().toLowerCase(),
      };
      if (editingVehicleId) {
        await updateVehicle(editingVehicleId, payload);
      } else {
        await createVehicle(payload);
      }
      setForm(DEFAULT_FORM);
      setEditingVehicleId(null);
      await loadVehicles();
      await refreshPendingSync();
    } catch (e: any) {
      setError(e.message || 'No se pudo procesar el vehículo');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (vehicle: any) => {
    setEditingVehicleId(vehicle.id);
    setForm({
      type: vehicle.type,
      plate: vehicle.plate || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      ownerName: vehicle.owner?.name || vehicle.ownerName || '',
      ownerEmail: vehicle.owner?.email || vehicle.ownerEmail || '',
    });
  };

  if (loading) {
    return <LoadingScreen message="Cargando vehículos..." />;
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
        <Text style={styles.eyebrow}>Parking</Text>
        <Text style={styles.title}>Vehículos gestionados</Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {pendingSyncCount > 0 ? (
          <View style={styles.syncCard}>
            <View style={styles.syncCardInfo}>
              <Text style={styles.syncCardTitle}>Cambios pendientes sin conexión</Text>
              <Text style={styles.syncCardSubtitle}>
                Tienes {pendingSyncCount} acción(es) pendiente(s) por sincronizar.
              </Text>
            </View>
            <Pressable
              style={[styles.syncButton, syncing && styles.buttonDisabled]}
              onPress={handleSyncPending}
              disabled={syncing}
            >
              <Text style={styles.syncButtonText}>
                {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{editingVehicleId ? 'Actualizar vehículo o moto' : 'Agregar vehículo o moto'}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tipo</Text>
            <View style={styles.typeRow}>
              {['CAR', 'MOTORCYCLE'].map((type) => (
                <Pressable
                  key={type}
                  style={[styles.typeOption, form.type === type && styles.typeOptionSelected]}
                  onPress={() => setForm((current) => ({ ...current, type }))}
                >
                  <Text style={[styles.typeText, form.type === type && styles.typeTextSelected]}>
                    {type === 'CAR' ? 'Automóvil' : 'Moto'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Placa</Text>
            <TextInput
              value={form.plate}
              onChangeText={(value) => setForm((current) => ({ ...current, plate: value }))}
              placeholder="ABC-123"
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Marca</Text>
            <TextInput
              value={form.brand}
              onChangeText={(value) => setForm((current) => ({ ...current, brand: value }))}
              placeholder="Toyota"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Modelo</Text>
            <TextInput
              value={form.model}
              onChangeText={(value) => setForm((current) => ({ ...current, model: value }))}
              placeholder="Corolla"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nombre del propietario</Text>
            <TextInput
              value={form.ownerName}
              onChangeText={(value) => setForm((current) => ({...current, ownerName: value}))}
              placeholder="Nombre completo"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Correo del propietario</Text>
            <TextInput
              value={form.ownerEmail}
              onChangeText={(value) => setForm((current) => ({...current, ownerEmail: value}))}
              placeholder="correo@ejemplo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          <Pressable style={styles.primaryButton} onPress={handleCreateVehicle} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : editingVehicleId ? 'Actualizar registro' : 'Guardar vehículo'}</Text>
          </Pressable>
          {editingVehicleId ? (
            <Pressable style={styles.cancelButton} onPress={() => { setEditingVehicleId(null); setForm(DEFAULT_FORM); }}>
              <Text style={styles.cancelButtonText}>Cancelar edición</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.listCard}>
          <Text style={styles.sectionTitle}>Registrados</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.emptyText}>Aún no tienes vehículos registrados.</Text>
          ) : (
            vehicles.map((vehicle) => {
              const isPending = vehicle.isPendingSync || String(vehicle.id).startsWith('temp_veh_');
              return (
                <View key={vehicle.id} style={styles.vehicleItem}>
                  <View>
                    <View style={styles.plateRow}>
                      <Text style={styles.vehiclePlate}>{vehicle.plate}</Text>
                      {isPending ? (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>Pendiente</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.vehicleMeta}>{vehicle.type === 'CAR' ? 'Automóvil' : 'Moto'}</Text>
                    <Text style={styles.vehicleMeta}>{vehicle.owner?.name || 'Propietario sin nombre'}</Text>
                  </View>
                  <View style={styles.vehicleActions}>
                    <Text style={styles.vehicleBrand}>{vehicle.brand || 'Sin marca'}</Text>
                    <Pressable onPress={() => startEditing(vehicle)} style={styles.editButton}>
                      <Text style={styles.editButtonText}>Editar</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
    paddingBottom: 30,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: {
    color: '#5b69ff',
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#101828',
    marginTop: 8,
    marginBottom: 18,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  listCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    color: '#344054',
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  ownerInput: {
    marginTop: 10,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#e0edff',
  },
  typeText: {
    color: '#475467',
    fontWeight: '700',
  },
  typeTextSelected: {
    color: '#1d4ed8',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#f8faff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#1e3a8a',
    fontWeight: '700',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#475467',
    fontWeight: '700',
  },
  vehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  vehiclePlate: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  vehicleMeta: {
    color: '#475467',
    marginTop: 4,
    fontSize: 12,
  },
  vehicleBrand: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 14,
  },
  vehicleActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#e0e7ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editButtonText: {
    color: '#1e3a8a',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyText: {
    color: '#475467',
    fontSize: 14,
    lineHeight: 22,
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
  loadingText: {
    marginTop: 12,
    color: '#475467',
    fontSize: 16,
  },
  syncCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  syncCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 2,
  },
  syncCardSubtitle: {
    fontSize: 12,
    color: '#3b82f6',
  },
  syncButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  pendingBadgeText: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
