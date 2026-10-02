import {
  ApplianceLoad,
  ClientRecord,
  ElectricalPanel,
  MonthlyConsumptionRecord,
  ServiceSupply,
} from '../types/electrical';

/**
 * Manejo de las acometidas (suministros) de un cliente.
 *
 * Un inmueble puede tener más de una: un supermercado suele tener una para el
 * sector de ventas y otra para el depósito, cada una con su medidor, su tarifa y
 * sus tableros.
 *
 * Para no reescribir todo el código que ya usaba los campos de suministro del
 * cliente (`serviceType`, `nominalVoltage`, `lineVoltage`, `mainBreakerAmps`,
 * `kwhCost`, `fixedCharge`), esos campos siguen existiendo y **reflejan la
 * acometida principal** (la primera de la lista). `normalizeClient` mantiene esa
 * correspondencia, y también migra los clientes guardados antes de este cambio.
 */

const SUPPLY_ID_PREFIX = 'sup';

/** Id fijo de la acometida que se deduce de un cliente guardado sin acometidas. */
export const LEGACY_SUPPLY_ID = 'sup_principal';

export function newSupplyId(): string {
  return `${SUPPLY_ID_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Arma una acometida a partir de los campos de suministro del cliente.
 *
 * El id es fijo a propósito: los clientes guardados antes de que existieran las
 * acometidas no tienen ninguna, y esta función se llama cada vez que se leen.
 * Con un id aleatorio, cada llamada devolvería una acometida distinta y las
 * cargas no se reconocerían como propias.
 */
export function buildPrimarySupply(client: ClientRecord): ServiceSupply {
  return {
    id: LEGACY_SUPPLY_ID,
    name: 'Acometida principal',
    serviceType: client.serviceType,
    nominalVoltage: client.nominalVoltage,
    lineVoltage: client.lineVoltage,
    mainBreakerAmps: client.mainBreakerAmps,
    kwhCost: client.kwhCost,
    fixedCharge: client.fixedCharge,
    currency: client.currency === 'ARS' ? 'ARS' : 'USD',
    verified: client.supplyVerified,
    verifiedAt: client.supplyVerifiedAt,
    measurements: client.diagnosticMeasurements,
  };
}

/**
 * Deja el cliente en un estado consistente:
 *  - garantiza que haya al menos una acometida (migrando los datos viejos);
 *  - copia los datos de la acometida principal a los campos del cliente, para
 *    que el resto del programa siga funcionando sin cambios;
 *  - asigna a cada tablero y a cada factura una acometida válida.
 */
export function normalizeClient(client: ClientRecord): ClientRecord {
  const supplies =
    client.supplies && client.supplies.length > 0 ? client.supplies.map((supply) => ({ ...supply })) : [buildPrimarySupply(client)];

  const primary = supplies[0];
  const validIds = new Set(supplies.map((supply) => supply.id));

  const panels = (client.panels ?? []).map((panel) => ({
    ...panel,
    supplyId: panel.supplyId && validIds.has(panel.supplyId) ? panel.supplyId : primary.id,
  }));

  const consumptionHistory = (client.consumptionHistory ?? []).map((record) => ({
    ...record,
    supplyId: record.supplyId && validIds.has(record.supplyId) ? record.supplyId : primary.id,
  }));

  return {
    ...client,
    supplies,
    panels,
    consumptionHistory,
    // Espejo de la acometida principal
    serviceType: primary.serviceType,
    nominalVoltage: primary.nominalVoltage,
    lineVoltage: primary.lineVoltage,
    mainBreakerAmps: primary.mainBreakerAmps,
    kwhCost: primary.kwhCost,
    fixedCharge: primary.fixedCharge,
    supplyVerified: primary.verified,
    supplyVerifiedAt: primary.verifiedAt,
    diagnosticMeasurements: primary.measurements,
  };
}

/** Acometidas del cliente (nunca vacío). */
export function getSupplies(client: ClientRecord): ServiceSupply[] {
  if (client.supplies && client.supplies.length > 0) return client.supplies;
  return [buildPrimarySupply(client)];
}

/** Acometida principal: la primera de la lista. */
export function getPrimarySupply(client: ClientRecord): ServiceSupply {
  return getSupplies(client)[0];
}

export function findSupply(client: ClientRecord, supplyId?: string): ServiceSupply | undefined {
  if (!supplyId) return getPrimarySupply(client);
  return getSupplies(client).find((supply) => supply.id === supplyId);
}

/** Acometida a la que está conectado un tablero. */
export function supplyOfPanel(client: ClientRecord, panel?: ElectricalPanel): ServiceSupply {
  const supplies = getSupplies(client);
  return supplies.find((supply) => supply.id === panel?.supplyId) ?? supplies[0];
}

/** Acometida a la que está conectada una carga, a través de su tablero. */
export function supplyOfLoad(client: ClientRecord, load: ApplianceLoad): ServiceSupply {
  const panel = (client.panels ?? []).find((candidate) => candidate.id === load.panelId);
  return supplyOfPanel(client, panel);
}

/** Tableros de una acometida. */
export function panelsOfSupply(client: ClientRecord, supplyId: string): ElectricalPanel[] {
  return (client.panels ?? []).filter((panel) => (panel.supplyId || getPrimarySupply(client).id) === supplyId);
}

/**
 * Cargas de una acometida.
 *
 * Se toman las de sus tableros. Las cargas que apuntan a un tablero que ya no
 * existe se cuentan en la acometida principal, para no perderlas de los cálculos
 * (es el mismo criterio con el que la app las asigna por defecto).
 */
export function loadsOfSupply(client: ClientRecord, supplyId: string): ApplianceLoad[] {
  const supplies = getSupplies(client);
  const isPrimary = supplies[0].id === supplyId;
  const allPanelIds = new Set((client.panels ?? []).map((panel) => panel.id));
  const panelIds = new Set(panelsOfSupply(client, supplyId).map((panel) => panel.id));

  return client.loads.filter((load) => {
    if (load.panelId && panelIds.has(load.panelId)) return true;
    // Sin tablero válido: queda en la principal.
    return isPrimary && (!load.panelId || !allPanelIds.has(load.panelId));
  });
}

/** Facturas de una acometida. */
export function billsOfSupply(client: ClientRecord, supplyId: string): MonthlyConsumptionRecord[] {
  return (client.consumptionHistory ?? []).filter(
    (record) => (record.supplyId || getPrimarySupply(client).id) === supplyId
  );
}

/** ¿Todas las acometidas están confirmadas en el sitio? */
export function allSuppliesVerified(client: ClientRecord): boolean {
  const supplies = getSupplies(client);
  return supplies.length > 0 && supplies.every((supply) => supply.verified === true);
}

/** ¿Hay mediciones de campo en alguna acometida? */
export function hasAnyMeasurements(client: ClientRecord): boolean {
  return getSupplies(client).some((supply) => {
    const m = supply.measurements;
    if (!m) return false;
    return (
      (typeof m.vL1N === 'number' && m.vL1N > 0) ||
      (typeof m.iL1 === 'number' && m.iL1 > 0) ||
      (typeof m.groundResistanceOhms === 'number' && m.groundResistanceOhms > 0) ||
      m.hasGroundRod === true
    );
  });
}

/** Devuelve el cliente con una acometida agregada o modificada. */
export function upsertSupply(client: ClientRecord, supply: ServiceSupply): ClientRecord {
  const supplies = getSupplies(client);
  const exists = supplies.some((candidate) => candidate.id === supply.id);
  return normalizeClient({
    ...client,
    supplies: exists ? supplies.map((candidate) => (candidate.id === supply.id ? supply : candidate)) : [...supplies, supply],
  });
}

/**
 * Borra una acometida y reasigna sus tableros a la primera que quede, para no
 * dejar tableros ni cargas huérfanos. No permite quedarse sin acometidas.
 */
export function removeSupply(client: ClientRecord, supplyId: string): ClientRecord {
  const supplies = getSupplies(client);
  if (supplies.length <= 1) return client;

  const remaining = supplies.filter((supply) => supply.id !== supplyId);
  const fallbackId = remaining[0].id;

  return normalizeClient({
    ...client,
    supplies: remaining,
    panels: (client.panels ?? []).map((panel) =>
      panel.supplyId === supplyId ? { ...panel, supplyId: fallbackId } : panel
    ),
    consumptionHistory: (client.consumptionHistory ?? []).map((record) =>
      record.supplyId === supplyId ? { ...record, supplyId: fallbackId } : record
    ),
  });
}

/** Mueve una acometida al primer lugar: pasa a ser la principal. */
export function makePrimarySupply(client: ClientRecord, supplyId: string): ClientRecord {
  const supplies = getSupplies(client);
  const target = supplies.find((supply) => supply.id === supplyId);
  if (!target) return client;
  return normalizeClient({
    ...client,
    supplies: [target, ...supplies.filter((supply) => supply.id !== supplyId)],
  });
}

/** Resumen corto de una acometida, para listados y encabezados. */
export function describeSupply(supply: ServiceSupply): string {
  const phases = supply.serviceType === 'Trifásico (3F+N)' ? '3F' : supply.serviceType === 'Bifásico (2F+N)' ? '2F' : '1F';
  return `${phases} · ${supply.nominalVoltage}/${supply.lineVoltage} V · térmica ${supply.mainBreakerAmps} A`;
}
