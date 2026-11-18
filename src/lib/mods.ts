// Pure mods logic. No runtime imports: unit-tested directly with node --test.

export const MOD_CATEGORIES = ['Exterior', 'Interior', 'Performance', 'Audio', 'Wheels/Tires', 'Lighting', 'Other'] as const;
export type ModCategory = (typeof MOD_CATEGORIES)[number];

export type Mod = { id: number; name: string; category: ModCategory; date: string; cost: number; shop: string | null; notes: string | null };
export type ModForm = { name: string; category: ModCategory | ''; date: string; cost: string; shop: string; notes: string };
export type ModErrors = Partial<Record<keyof ModForm, string>>;
export type ModInput = Omit<Mod, 'id'>;

/** Total spent per category, biggest first; categories with no spend are left out. Summed in centavos. */
export function modBreakdown(mods: Pick<Mod, 'category' | 'cost'>[]): { category: ModCategory; total: number }[] {
  const cents = new Map<ModCategory, number>();
  for (const m of mods) cents.set(m.category, (cents.get(m.category) ?? 0) + Math.round(m.cost * 100));
  return [...cents].filter(([, c]) => c > 0).map(([category, c]) => ({ category, total: c / 100 })).sort((a, b) => b.total - a.total);
}

export function validateMod(f: ModForm): { errors: ModErrors; value?: ModInput } {
  const e: ModErrors = {};
  if (!f.name.trim()) e.name = 'Required';
  if (!MOD_CATEGORIES.includes(f.category as ModCategory)) e.category = 'Pick one';
  const date = f.date.trim();
  const [y, m, d] = date.split('-').map(Number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) e.date = 'Use YYYY-MM-DD';
  const t = f.cost.replace(/,/g, '').trim();
  const cost = t === '' ? 0 : Number(t);
  if (!Number.isFinite(cost) || cost < 0) e.cost = 'Must be 0 or more';
  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    value: { name: f.name.trim(), category: f.category as ModCategory, date, cost, shop: f.shop.trim() || null, notes: f.notes.trim() || null },
  };
}
