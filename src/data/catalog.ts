import raw from './ph-models.json';

export type Variant = { name: string; engine: string; transmission: string; fuel_type: string };
export type CatalogModel = {
  make: string;
  model: string;
  years: [number, number];
  tank_liters: number;
  pms_interval_km: number;
  pms_interval_months: number;
  variants: Variant[];
};

export const CATALOG = raw as CatalogModel[];
export const MAKES = [...new Set(CATALOG.map((m) => m.make))];
export const modelsOf = (make: string) => CATALOG.filter((m) => m.make === make);
export const findModel = (make: string, model: string) => CATALOG.find((m) => m.make === make && m.model === model);
export const yearsOf = (m: CatalogModel) =>
  Array.from({ length: m.years[1] - m.years[0] + 1 }, (_, i) => m.years[1] - i); // newest first
