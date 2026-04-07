import db from '../config/db.ts';
import { format, subDays, parseISO, isSameDay } from 'date-fns';

export class StreakService {
  /**
   * Checks and updates the user's streak.
   * A streak is earned if all scheduled tasks for today are completed.
   */
  static async updateStreak(userId: number) {
    const user = db.prepare('SELECT id, streak, lastStreakUpdate FROM users WHERE id = ?').get(userId) as any;
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    
    // If streak was already updated today, no need to do anything
    if (user.lastStreakUpdate === today) {
      return { streak: user.streak, updated: false };
    }

    const todayStart = today + 'T00:00:00';
    const todayEnd = today + 'T23:59:59';

    // Define task types that count towards the streak
    const taskTypes = ['todo', 'project', 'internship_task', 'internship_subtask', 'study', 'study_plan', 'exam'];

    // Check for pending tasks for today
    const pendingTasks = db.prepare(`
      SELECT COUNT(*) as count 
      FROM schedule_items 
      WHERE userId = ? 
      AND startTime >= ? 
      AND startTime <= ? 
      AND status = 'pending'
      AND type IN (${taskTypes.map(() => '?').join(',')})
    `).get(userId, todayStart, todayEnd, ...taskTypes) as any;

    const totalTasks = db.prepare(`
      SELECT COUNT(*) as count 
      FROM schedule_items 
      WHERE userId = ? 
      AND startTime >= ? 
      AND startTime <= ? 
      AND type IN (${taskTypes.map(() => '?').join(',')})
    `).get(userId, todayStart, todayEnd, ...taskTypes) as any;

    // Logic:
    // 1. If there are tasks today and all are completed -> update streak.
    // 2. If there are NO tasks today -> update streak (they used the app and had nothing to do).
    // 3. If there are pending tasks -> do nothing (streak not earned yet today).

    if (pendingTasks.count === 0) {
      let newStreak = 1;
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // If last update was yesterday, increment. Otherwise, start fresh at 1.
      if (user.lastStreakUpdate === yesterday) {
        newStreak = (user.streak || 0) + 1;
      } else if (user.lastStreakUpdate === today) {
        // Already handled above, but for safety:
        return { streak: user.streak, updated: false };
      }

      db.prepare('UPDATE users SET streak = ?, lastStreakUpdate = ? WHERE id = ?').run(newStreak, today, userId);
      return { streak: newStreak, updated: true };
    }

    return { streak: user.streak, updated: false };
  }

  /**
   * Resets the streak if the user missed a day.
   * This should be called when the user logs in or opens the dashboard.
   */
  static async checkStreakReset(userId: number) {
    const user = db.prepare('SELECT id, streak, lastStreakUpdate FROM users WHERE id = ?').get(userId) as any;
    if (!user || !user.lastStreakUpdate) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    // If last update was not today and not yesterday, the streak is broken.
    if (user.lastStreakUpdate !== today && user.lastStreakUpdate !== yesterday) {
      db.prepare('UPDATE users SET streak = 0 WHERE id = ?').run(userId);
      return 0;
    }

    return user.streak;
  }
}
