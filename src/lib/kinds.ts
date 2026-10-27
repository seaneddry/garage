import type { EntryKind } from '../types';

export const KINDS: EntryKind[] = ['fuel', 'service', 'care', 'renewal', 'other'];

export const KIND_LABEL: Record<EntryKind, string> = {
  fuel: 'Fuel',
  service: 'Service & parts',
  care: 'Car care',
  renewal: 'Road tax & insurance',
  other: 'Other',
};

export const KIND_SHORT: Record<EntryKind, string> = {
  fuel: 'Fuel',
  service: 'Service',
  care: 'Wash',
  renewal: 'Renewal',
  other: 'Other',
};

export const KIND_ICON: Record<EntryKind, string> = {
  fuel: 'fuel',
  service: 'wrench',
  care: 'drop',
  renewal: 'doc',
  other: 'tag',
};

export const FUEL_GRADES = ['RON95', 'RON97', 'RON100', 'Diesel'];
export const STATIONS = ['Petronas', 'Shell', 'Petron', 'Caltex', 'BHPetrol'];
