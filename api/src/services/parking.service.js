export function validatePurchaseInput({ vehicleId, planId, paymentMethod, amount, userId }) {
  if (
    typeof userId !== 'string' || !userId ||
    typeof vehicleId !== 'string' || !vehicleId ||
    typeof planId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(planId) ||
    typeof paymentMethod !== 'string' || !/^[A-Z_]{2,32}$/.test(paymentMethod) ||
    amount === undefined || amount === null
  ) {
    throw new Error('Missing required purchase fields');
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Purchase amount must be a positive number');
  }

  return {
    userId,
    vehicleId,
    planId,
    paymentMethod,
    amount,
  };
}

export function calculateDaysRemaining(dateEnd, now = new Date()) {
  const endDate = new Date(dateEnd);
  const diffMs = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function getServiceStatus(daysRemaining) {
  if (daysRemaining <= 0) {
    return 'EXPIRED';
  }

  if (daysRemaining <= 5) {
    return 'PENDING';
  }

  return 'ACTIVE';
}

export function buildServiceSummary(service) {
  if (!service) {
    return {
      hasActiveService: false,
      status: 'INACTIVE',
      daysRemaining: 0,
      message: 'No active service found',
    };
  }

  const daysRemaining = calculateDaysRemaining(service.dateEnd, new Date());
  const status = getServiceStatus(daysRemaining);

  return {
    hasActiveService: true,
    status,
    daysRemaining,
    vehicleId: service.vehicleId,
    vehicleType: service.vehicleType,
    dateStart: service.dateStart,
    dateEnd: service.dateEnd,
    message: status === 'PENDING'
      ? 'Servicio próximo a vencer'
      : 'Servicio activo y vigente',
  };
}
