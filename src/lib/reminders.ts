import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCar, getPmsStatus } from '@/db/cars';
import { getLoanData } from '@/db/loans';
import { peso, shortDate } from '@/lib/format';
import { reminderTimes } from '@/lib/loan';
import { pmsReminderTime } from '@/lib/pms';

const LOAN_PREFIX = 'loan-due-';
const PMS_ID = 'pms-due';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Replace every Mavvy reminder:
 *  - loan: the next 12 unpaid due dates, 3 days before at 09:00;
 *  - PMS: one reminder 7 days before the date-based due date at 09:00 (skipped once that has passed).
 * Called on app start and after any loan, payment, PMS log or car-interval change. Only prompts for
 * permission when askPermission is set (first loan or PMS save). Never throws: reminders must not block saving.
 */
export async function syncReminders(db: SQLiteDatabase, { askPermission = false } = {}) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(LOAN_PREFIX) || n.identifier === PMS_ID)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );

    const car = await getCar(db);
    if (!car) return;
    const loan = await getLoanData(db, car.id);
    const pms = await getPmsStatus(db, car.id);
    if (!loan && !pms) return;

    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && askPermission && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;

    const date = (d: Date) => ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date: d }) as const;

    for (const r of loan ? reminderTimes(loan.status, new Date()) : []) {
      await Notifications.scheduleNotificationAsync({
        identifier: LOAN_PREFIX + r.due,
        content: { title: 'Car loan due in 3 days', body: `${peso(loan!.status.monthly)} is due on ${shortDate(r.due)}.` },
        trigger: date(r.at),
      });
    }

    const pmsAt = pms ? pmsReminderTime(pms.dueDate, new Date()) : null;
    if (pms && pmsAt) {
      await Notifications.scheduleNotificationAsync({
        identifier: PMS_ID,
        content: {
          title: 'PMS due in a week',
          body: `Book your ${car.make} ${car.model}'s service: due ${shortDate(pms.dueDate)} or at ${pms.dueKm.toLocaleString('en-PH')} km.`,
        },
        trigger: date(pmsAt),
      });
    }  } catch (err) {
    console.warn('Reminders not updated:', err);
  }
}
