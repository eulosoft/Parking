import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

const configuredApiUrl = Config.API_URL?.trim().replace(/\/+$/, '');
let parsedApiUrl;
try {
  parsedApiUrl = new URL(configuredApiUrl);
} catch {
  throw new Error('Configure API_URL as an absolute URL ending in /api.');
}
if (
  parsedApiUrl.pathname !== '/api' ||
  parsedApiUrl.search ||
  parsedApiUrl.hash ||
  parsedApiUrl.username ||
  parsedApiUrl.password ||
  (!__DEV__ && parsedApiUrl.protocol !== 'https:')
) {
  throw new Error('Configure API_URL ending in /api; release builds require HTTPS.');
}
const API_BASE_URL = configuredApiUrl;
let authToken = null;

const readJSON = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
};

const writeJSON = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // graceful fallback when storage is unavailable
  }
};

const readCachedVehicles = async () => readJSON('parking_vehicles_cache') || [];

const writeCachedVehicles = async (vehicles) => writeJSON('parking_vehicles_cache', vehicles);

const readSyncQueue = async () => readJSON('parking_pending_sync') || [];

const writeSyncQueue = async (queue) => writeJSON('parking_pending_sync', queue);

export async function setAuthToken(token) {
  authToken = token;
  await writeJSON('parking_auth_token', token || null);
}

export async function setCurrentUser(user) {
  if (!user) {
    await writeJSON('parking_user', null);
    return;
  }

  await writeJSON('parking_user', user);
}

export async function validateSession() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: await defaultHeaders(),
  });
  const data = await response.json();
  if (!response.ok || !data.user?.id || !data.user?.role) {
    throw new Error(data.message || 'La sesión no es válida.');
  }
  await setCurrentUser(data.user);
  return data.user;
}

export async function exchangeFirebaseToken(idToken) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/firebase`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({idToken}),
    });
  } catch (error) {
    if (error instanceof TypeError || error?.message === 'Network request failed') {
      throw new Error(`No hay conexión con el servidor (${API_BASE_URL}). Verifica que la API esté ejecutándose.`);
    }
    throw error;
  }

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
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
  return data.user;
}

export async function loginAdmin(email, password) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password}),
    });
  } catch (error) {
    if (error instanceof TypeError || error?.message === 'Network request failed') {
      throw new Error(`No hay conexión con el servidor (${API_BASE_URL}). Verifica que la API esté ejecutándose.`);
    }
    throw error;
  }

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
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
  return data.user;
}

export async function getStoredAuthToken() {
  if (authToken) {
    return authToken;
  }

  const stored = await readJSON('parking_auth_token');
  authToken = stored;
  return authToken;
}

export async function clearSession() {
  authToken = null;
  await Promise.all([
    AsyncStorage.removeItem('parking_auth_token'),
    AsyncStorage.removeItem('parking_user'),
    AsyncStorage.removeItem('parking_service_cache'),
    AsyncStorage.removeItem('parking_vehicles_cache'),
    AsyncStorage.removeItem('parking_history_cache'),
    AsyncStorage.removeItem('parking_pending_sync'),
  ]);
}

export async function registerDeviceToken(token) {
  const response = await fetch(`${API_BASE_URL}/notifications/token`, {
    method: 'POST',
    headers: await defaultHeaders(),
    body: JSON.stringify({ token }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Error registering device token');
  }

  return data;
}

const defaultHeaders = async () => {
  const token = await getStoredAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  };
};

export async function getHealthStatus() {
  const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
  return response.json();
}

/**
 * @param {string | null} [vehicleId]
 */
export async function getAdminServiceHistory() {
  const response = await fetch(`${API_BASE_URL}/admin/services/history`, {
    headers: await defaultHeaders(),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo cargar el historial administrativo.');
  }
  return Array.isArray(data.services) ? data.services : [];
}

export async function setVehicleServiceState(vehicleId, active, days = 30) {
  const response = await fetch(
    `${API_BASE_URL}/admin/vehicles/${encodeURIComponent(vehicleId)}/service`,
    {
      method: 'PUT',
      headers: await defaultHeaders(),
      body: JSON.stringify({active, days}),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'No se pudo actualizar el servicio.');
  }
  return data.service;
}

export async function getVehicles() {
  const response = await fetch(`${API_BASE_URL}/admin/vehicles`, {
    headers: await defaultHeaders(),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Error fetching vehicles');
  }

  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  await writeCachedVehicles(vehicles);
  return vehicles;
}

export async function createVehicle(payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/admin/vehicles`, {
      method: 'POST',
      headers: await defaultHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    const tempId = `temp_veh_${Date.now()}`;
    const localVehicle = {
      id: tempId,
      userId: payload.userId,
      type: String(payload.type).toUpperCase(),
      plate: payload.plate.trim(),
      brand: (payload.brand || '').trim(),
      model: (payload.model || '').trim(),
      ownerName: payload.ownerName.trim(),
      ownerEmail: payload.ownerEmail.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
      isPendingSync: true,
    };
    const currentCached = await readCachedVehicles();
    await writeCachedVehicles([localVehicle, ...currentCached]);
    await queuePendingSync('create_vehicle', { ...payload, tempId });
    return localVehicle;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Error creating vehicle');
  }

  const currentCached = await readCachedVehicles();
  await writeCachedVehicles([data.vehicle, ...currentCached.filter((v) => v.id !== data.vehicle.id)]);
  return data.vehicle;
}

export async function updateVehicle(vehicleId, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: await defaultHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    const currentCached = await readCachedVehicles();
    let updatedVehicle = null;
    const nextCached = currentCached.map((v) => {
      if (v.id === vehicleId) {
        updatedVehicle = {
          ...v,
          ...payload,
          type: (payload.type || v.type).toUpperCase(),
          isPendingSync: true,
        };
        return updatedVehicle;
      }
      return v;
    });
    await writeCachedVehicles(nextCached);
    await queuePendingSync('update_vehicle', { vehicleId, payload });
    return updatedVehicle || { id: vehicleId, ...payload, isPendingSync: true };
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Error updating vehicle');
  }

  const currentCached = await readCachedVehicles();
  await writeCachedVehicles([data.vehicle, ...currentCached.filter((v) => v.id !== data.vehicle.id)]);
  return data.vehicle;
}

export async function queuePendingSync(action, payload) {
  try {
    const existing = await readSyncQueue();
    existing.push({ action, payload, createdAt: new Date().toISOString() });
    await writeSyncQueue(existing);
    return { queued: true };
  } catch (error) {
    return { queued: false, reason: 'Storage unavailable' };
  }
}

export async function getPendingSyncQueue() {
  return readSyncQueue();
}

export async function clearPendingSyncQueue() {
  await writeSyncQueue([]);
  return { cleared: true };
}

export async function syncPendingActions() {
  const queue = await getPendingSyncQueue();

  if (!queue.length) {
    return { synced: 0, pending: 0, rejectedPurchases: 0 };
  }

  const remaining = [];
  let synced = 0;
  let rejectedPurchases = 0;

  for (const item of queue) {
    try {
      if (item.action === 'purchase') {
        rejectedPurchases += 1;
      } else if (item.action === 'create_vehicle') {
        const response = await fetch(`${API_BASE_URL}/admin/vehicles`, {
          method: 'POST',
          headers: await defaultHeaders(),
          body: JSON.stringify({
            userId: item.payload.userId,
            type: item.payload.type,
            plate: item.payload.plate,
            brand: item.payload.brand,
            model: item.payload.model,
            ownerName: item.payload.ownerName,
            ownerEmail: item.payload.ownerEmail,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Sync create vehicle failed');
        }
        const currentCached = await readCachedVehicles();
        const updated = currentCached.filter((v) => v.id !== item.payload.tempId && v.id !== data.vehicle.id);
        updated.unshift(data.vehicle);
        await writeCachedVehicles(updated);
        synced += 1;
      } else if (item.action === 'update_vehicle') {
        const response = await fetch(`${API_BASE_URL}/vehicles/${item.payload.vehicleId}`, {
          method: 'PATCH',
          headers: await defaultHeaders(),
          body: JSON.stringify(item.payload.payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Sync update vehicle failed');
        }
        const currentCached = await readCachedVehicles();
        const updated = currentCached.map((v) => (v.id === data.vehicle.id ? data.vehicle : v));
        await writeCachedVehicles(updated);
        synced += 1;
      } else {
        remaining.push(item);
      }
    } catch (error) {
      remaining.push(item);
    }
  }

  await writeSyncQueue(remaining);
  return { synced, pending: remaining.length, rejectedPurchases };
}
