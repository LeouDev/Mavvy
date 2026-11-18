import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ComponentProps, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Chips, Field, FormSheet, Label, Step } from '@/components/ui';
import { CatalogModel, MAKES, findModel, modelsOf, yearsOf } from '@/data/catalog';
import { getCar, saveCar, type Car } from '@/db/cars';
import { maxLogOdometer } from '@/db/logs';
import { syncReminders } from '@/lib/reminders';
import { CarErrors, CarForm, validateCar } from '@/lib/validateCar';

const OTHER = 'Other / manual';
const EMPTY: CarForm = {
  make: '', model: '', year: '', variant: '', plate: '', vin: '', color: '', odometer: '',
  engine: '', transmission: '', fuel_type: '', tank: '', pmsKm: '5000', pmsMonths: '6',
};

const fromCar = (c: Car): CarForm => ({
  make: c.make, model: c.model, year: String(c.year), variant: c.variant ?? '', plate: c.plate ?? '', vin: c.vin ?? '',
  color: c.color ?? '', odometer: String(c.odometer_km), engine: c.engine ?? '', transmission: c.transmission ?? '',
  fuel_type: c.fuel_type ?? '', tank: c.tank_liters == null ? '' : String(c.tank_liters),
  pmsKm: String(c.pms_interval_km), pmsMonths: String(c.pms_interval_months),
});

export default function CarScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [existing, setExisting] = useState<Car | null>(null);
  const [form, setForm] = useState<CarForm>(EMPTY);
  const [manual, setManual] = useState(false);
  const [errors, setErrors] = useState<CarErrors>({});

  useEffect(() => {
    getCar(db).then((car) => {
      if (!car) return;
      setExisting(car);
      setForm(fromCar(car));
      setManual(!findModel(car.make, car.model));
    });
  }, [db]);

  const set = (patch: Partial<CarForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    // Clear errors for fields the user just changed.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };
  const entry = manual ? undefined : findModel(form.make, form.model);

  const pickMake = (make: string) => {
    if (make === OTHER) {
      setManual(true);
      return set({ make: '', model: '', year: '', variant: '' });
    }
    setManual(false);
    set({ make, model: '', year: '', variant: '' });
  };

  const pickModel = (m: CatalogModel) =>
    set({ model: m.model, year: '', variant: '', tank: String(m.tank_liters), pmsKm: String(m.pms_interval_km), pmsMonths: String(m.pms_interval_months) });

  const pickVariant = (name: string) => {
    const v = entry?.variants.find((x) => x.name === name);
    if (v) set({ variant: v.name, engine: v.engine, transmission: v.transmission, fuel_type: v.fuel_type });
  };

  const save = async () => {
    // Floor = highest fuel/PMS reading (not the car's own value), so a typo'd log can be deleted and the car corrected here.
    const floor = existing ? await maxLogOdometer(db, existing.id) : null;
    const { errors: e, value } = validateCar(form, floor, new Date().getFullYear());
    setErrors(e);
    if (!value) return;
    try {
      await saveCar(db, value, existing?.id);
      await syncReminders(db); // PMS intervals may have changed
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  const field = (key: keyof CarForm, label: string, extra?: Partial<ComponentProps<typeof Field>>) => (
    <Field label={label} value={form[key]} onChangeText={(t) => set({ [key]: t })} error={errors[key]} {...extra} />
  );

  return (
    <FormSheet title={existing ? 'Car details' : 'Add car'} saveLabel="Save car" onSave={save}>
        <Step n="01" title="Make" error={errors.make}>
          <Chips options={[...MAKES, OTHER]} value={manual ? OTHER : form.make || null} onChange={pickMake} />
        </Step>

        {manual ? (
          <Step n="02" title="Your car">
            {field('make', 'Make', { autoCapitalize: 'words' })}
            {field('model', 'Model', { autoCapitalize: 'words' })}
            {field('year', 'Year', { keyboardType: 'number-pad', maxLength: 4 })}
            {field('variant', 'Variant (optional)')}
          </Step>
        ) : form.make ? (
          <>
            <Step n="02" title="Model" error={errors.model}>
              <Chips options={modelsOf(form.make).map((m) => m.model)} value={form.model || null}
                onChange={(name) => pickModel(findModel(form.make, name)!)} />
            </Step>
            {entry && (
              <Step n="03" title="Year" error={errors.year}>
                <Chips options={yearsOf(entry)} value={form.year ? Number(form.year) : null} onChange={(y) => set({ year: String(y) })} />
              </Step>
            )}
            {entry && form.year ? (
              <Step n="04" title="Variant">
                <Chips options={entry.variants.map((v) => v.name)} value={form.variant || null} onChange={pickVariant} />
              </Step>
            ) : null}
          </>
        ) : null}

        <Step n="—" title="Specs">
          <Label style={{ marginBottom: 14 }}>Filled in from the model list. Edit if yours differs.</Label>
          {field('engine', 'Engine')}
          {field('transmission', 'Transmission')}
          {field('fuel_type', 'Fuel type')}
          {field('tank', 'Tank size', { keyboardType: 'decimal-pad', suffix: 'L' })}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {field('pmsKm', 'PMS every', { keyboardType: 'number-pad', suffix: 'KM', style: { flex: 1 } })}
            {field('pmsMonths', 'or every', { keyboardType: 'number-pad', suffix: 'MO', style: { flex: 1 } })}
          </View>
        </Step>

        <Step n="—" title="Identity">
          {field('odometer', 'Odometer', { keyboardType: 'number-pad', suffix: 'KM' })}
          {field('plate', 'Plate number', { autoCapitalize: 'characters' })}
          {field('color', 'Color', { autoCapitalize: 'words' })}
          {field('vin', 'VIN / chassis no. (optional)', { autoCapitalize: 'characters' })}
        </Step>
    </FormSheet>
  );
}
