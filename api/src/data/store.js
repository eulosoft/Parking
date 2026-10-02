// Select a durable adapter once per runtime. In particular, Firestore mode
// never opens the local SQLite file (which is ephemeral on serverless hosts).
const driver = process.env.STORAGE_DRIVER || 'sqlite';
if (!['sqlite', 'firestore'].includes(driver)) {
  throw new Error('STORAGE_DRIVER must be either "sqlite" or "firestore".');
}
if (process.env.NODE_ENV === 'production' && driver !== 'firestore') {
  throw new Error('STORAGE_DRIVER=firestore is required in production.');
}

const backend = await import(driver === 'firestore' ? './firestore-store.js' : './sqlite-store.js');

export const store = backend.store;
export const initializeStore = (...args) => backend.initializeStore(...args);
export const getUserByEmail = (...args) => backend.getUserByEmail(...args);
export const getUserById = (...args) => backend.getUserById(...args);
export const createUser = (...args) => backend.createUser(...args);
export const getVehicleById = (...args) => backend.getVehicleById(...args);
export const listVehiclesForAdmin = (...args) => backend.listVehiclesForAdmin(...args);
export const listAdminServiceHistory = (...args) => backend.listAdminServiceHistory(...args);
export const setVehicleServiceState = (...args) => backend.setVehicleServiceState(...args);
export const createVehicle = (...args) => backend.createVehicle(...args);
export const updateVehicle = (...args) => backend.updateVehicle(...args);
export const listVehiclesForUser = (...args) => backend.listVehiclesForUser(...args);
export const searchParkingRecords = (...args) => backend.searchParkingRecords(...args);
export const getActiveServiceForUser = (...args) => backend.getActiveServiceForUser(...args);
export const getActiveServiceForVehicle = (...args) => backend.getActiveServiceForVehicle(...args);
export const createServicePurchase = (...args) => backend.createServicePurchase(...args);
export const listServiceHistory = (...args) => backend.listServiceHistory(...args);
export const getServiceSummaryForUser = (...args) => backend.getServiceSummaryForUser(...args);
export const getServiceSummaryForVehicle = (...args) => backend.getServiceSummaryForVehicle(...args);
export const listNotificationsForUser = (...args) => backend.listNotificationsForUser(...args);
export const registerNotificationToken = (...args) => backend.registerNotificationToken(...args);
export const queueNotification = (...args) => backend.queueNotification(...args);
export const listDeviceTokensForUser = (...args) => backend.listDeviceTokensForUser(...args);
export const listActiveServices = (...args) => backend.listActiveServices(...args);
export const checkStorageHealth = (...args) => backend.checkStorageHealth(...args);
