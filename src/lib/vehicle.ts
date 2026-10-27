import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { listVehicles, vehiclePhotoUrl } from '../api';
import { useQuery } from './useQuery';
import type { Vehicle } from '../types';

interface VehicleValue {
  vehicles: Vehicle[];
  vehicle: Vehicle | null;
  loading: boolean;
  error: string | undefined;
  select: (id: string) => void;
  reload: () => void;
}

const VehicleContext = createContext<VehicleValue | null>(null);
const KEY = 'garage.vehicle';

function readKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The car being looked at. Remembered on this device; falls back to the default car. */
export function VehicleProvider({ children }: { children: ReactNode }) {
  const q = useQuery(listVehicles, []);
  const [selected, setSelected] = useState<string | null>(readKey);

  const value = useMemo<VehicleValue>(() => {
    const vehicles = (q.data ?? []).filter((v) => !v.archived);
    const vehicle = vehicles.find((v) => v.id === selected) ?? vehicles.find((v) => v.is_default) ?? vehicles[0] ?? null;
    return {
      vehicles,
      vehicle,
      loading: q.loading && !q.data,
      error: q.error,
      reload: q.reload,
      select: (id) => {
        setSelected(id);
        try {
          localStorage.setItem(KEY, id);
        } catch {
          /* private mode: selection lasts for this visit only */
        }
      },
    };
  }, [q.data, q.loading, q.error, q.reload, selected]);

  return createElement(VehicleContext.Provider, { value }, children);
}

export function useVehicle(): VehicleValue {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used inside VehicleProvider');
  return ctx;
}

export function vehicleName(v: Vehicle): string {
  return `${v.make} ${v.model}`.trim();
}

export function usePhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    vehiclePhotoUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
