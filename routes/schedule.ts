import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { StreakService } from '../services/streak.ts';
import { format } from 'date-fns';

const router = express.Router();

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const schedule = db.prepare(`
    SELECT s.*,
      COALESCE(i1.workingDays, i2.workingDays, i3.workingDays) as workingDays
    FROM schedule_items s
    -- Case 1: Directly an internship task
    LEFT JOIN internship_tasks it1 ON s.type = 'internship_task' AND s.relatedId = it1.id
    LEFT JOIN internships i1 ON it1.internshipId = i1.id
    -- Case 2: A todo related to an internship task
    LEFT JOIN todos t ON (s.type = 'internship_task' OR s.type = 'internship_subtask' OR s.type = 'todo') AND s.relatedId = t.id
    LEFT JOIN internship_tasks it2 ON t.relatedType = 'internship_task' AND t.relatedId = it2.id
    LEFT JOIN internships i2 ON it2.internshipId = i2.id
    -- Case 3: A todo related to an internship subtask
    LEFT JOIN internship_subtasks ist ON t.relatedType = 'internship_subtask' AND t.relatedId = ist.id
    LEFT JOIN internship_tasks it3 ON ist.taskId = it3.id
    LEFT JOIN internships i3 ON it3.internshipId = i3.id
    WHERE s.userId = ?
    ORDER BY s.startTime ASC
  `).all(req.user!.id);
  res.json(schedule);
});

router.post('/generate', authenticateToken, async (req: AuthRequest, res) => {
  const { startDate, days, clearAll } = req.body;
  try {
    const targetDate = startDate || format(new Date(), 'yyyy-MM-dd');
    const numDays = days || 30;
    const schedule = await SchedulerService.generateSchedule(req.user!.id, targetDate, numDays);
    await SchedulerService.saveSchedule(req.user!.id, schedule, targetDate, numDays, clearAll);
    res.json(schedule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error generating schedule' });
  }
});

router.patch('/:id', authenticateToken, (req: AuthRequest, res) => {
  const { status } = req.body;
  const item = db.prepare('SELECT * FROM schedule_items WHERE id = ?').get(req.params.id) as any;
  
  if (!item) return res.status(404).json({ message: 'Item not found' });

  db.prepare('UPDATE schedule_items SET status = ? WHERE id = ?').run(status, req.params.id);

  // Sync back to source table if applicable
  if (item.relatedId) {
    if (item.type === 'todo') {
      db.prepare('UPDATE todos SET status = ? WHERE id = ?').run(status, item.relatedId);
    } else if (item.type === 'project') {
      db.prepare('UPDATE project_tasks SET status = ? WHERE id = ?').run(status, item.relatedId);
    } else if (item.type === 'internship_task') {
      db.prepare('UPDATE internship_tasks SET status = ? WHERE id = ?').run(status, item.relatedId);
    }
  }

  // Check and update streak
  StreakService.updateStreak(req.user!.id).catch(err => console.error('Streak update error:', err));

  res.json({ message: 'Schedule item updated' });
});

export default router;
