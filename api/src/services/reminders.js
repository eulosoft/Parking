export function getReminderStatus(dateEnd, now = new Date()) {
  const endDate = new Date(dateEnd);
  const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'EXPIRED';
  }

  if (diffDays <= 5) {
    return 'REMINDER_DUE';
  }

  return 'ACTIVE';
}

export function buildReminderMessage(service, vehicle = null) {
  const { daysRemaining } = service;
  const vehicleLabel = vehicle
    ? ` para el vehículo ${vehicle.plate || vehicle.id}`
    : '';

  if (daysRemaining <= 0) {
    return `Tu servicio de parqueadero${vehicleLabel} ha vencido.`;
  }

  if (daysRemaining <= 5) {
    return `Tu servicio de parqueadero${vehicleLabel} vence en ${daysRemaining} día(s).`;
  }

  return `Tu servicio${vehicleLabel} está activo y sin recordatorios pendientes.`;
}
