import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { SupportedCurrency } from '../types/electrical';
import { formatCurrency, convertCurrency } from '../utils/electricalMath';

const STORAGE_KEY_CURRENCY = 'electropro_active_currency_v1';
const STORAGE_KEY_RATE = 'electropro_usd_ars_rate_v1';
export const DEFAULT_USD_ARS_RATE = 1250;

export interface CurrencyContextType {
  activeCurrency: SupportedCurrency;
  setActiveCurrency: (c: SupportedCurrency) => void;
  toggleCurrency: () => void;
  usdToArsRate: number;
  setUsdToArsRate: (rate: number) => void;
  convert: (amount: number, fromCurrency?: string, targetCurrency?: SupportedCurrency) => number;
  format: (
    amount: number,
    fromCurrency?: string,
    overrideTarget?: SupportedCurrency,
    options?: { hideCode?: boolean; showSymbolOnly?: boolean }
  ) => string;
  formatRaw: (
    amount: number,
    currency?: SupportedCurrency,
    options?: { hideCode?: boolean; showSymbolOnly?: boolean }
  ) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

/**
 * Lee del almacenamiento local solo si está disponible. En un entorno sin
 * `localStorage` (por ejemplo un render de servidor o una prueba) se usan los
 * valores por defecto en lugar de ensuciar la consola con errores.
 */
function readStored(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCurrency, setActiveCurrencyState] = useState<SupportedCurrency>(() => {
    const saved = readStored(STORAGE_KEY_CURRENCY);
    if (saved === 'ARS' || saved === 'USD') return saved;
    // Por defecto se trabaja en pesos argentinos; el dolar se elige a mano.
    return 'ARS';
  });

  const [usdToArsRate, setUsdToArsRateState] = useState<number>(() => {
    const saved = readStored(STORAGE_KEY_RATE);
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val > 0) return val;
    }
    return DEFAULT_USD_ARS_RATE;
  });

  const setActiveCurrency = (c: SupportedCurrency) => {
    const valid = c === 'ARS' ? 'ARS' : 'USD';
    setActiveCurrencyState(valid);
    writeStored(STORAGE_KEY_CURRENCY, valid);
  };

  const toggleCurrency = () => {
    setActiveCurrency(activeCurrency === 'USD' ? 'ARS' : 'USD');
  };

  const setUsdToArsRate = (rate: number) => {
    const safeRate = rate > 0 ? rate : DEFAULT_USD_ARS_RATE;
    setUsdToArsRateState(safeRate);
    writeStored(STORAGE_KEY_RATE, safeRate.toString());
  };

  const convert = (
    amount: number,
    fromCurrency?: string,
    targetCurrency?: SupportedCurrency
  ): number => {
    const from = fromCurrency === 'ARS' ? 'ARS' : 'USD';
    const to = targetCurrency || activeCurrency;
    return convertCurrency(amount, from, to, usdToArsRate);
  };

  const format = (
    amount: number,
    fromCurrency?: string,
    overrideTarget?: SupportedCurrency,
    options?: { hideCode?: boolean; showSymbolOnly?: boolean }
  ): string => {
    const target = overrideTarget || activeCurrency;
    const from = fromCurrency === 'ARS' ? 'ARS' : 'USD';
    const converted = convertCurrency(amount, from, target, usdToArsRate);
    return formatCurrency(converted, target, options);
  };

  const formatRaw = (
    amount: number,
    currency?: SupportedCurrency,
    options?: { hideCode?: boolean; showSymbolOnly?: boolean }
  ): string => {
    const target = currency || activeCurrency;
    return formatCurrency(amount, target, options);
  };

  const value = useMemo(
    () => ({
      activeCurrency,
      setActiveCurrency,
      toggleCurrency,
      usdToArsRate,
      setUsdToArsRate,
      convert,
      format,
      formatRaw,
    }),
    [activeCurrency, usdToArsRate]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
