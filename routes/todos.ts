import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { StreakService } from '../services/streak.ts';
import { format } from 'date-fns';

const router = express.Router();

const syncUserSchedule = async (userId: number) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const days = 365;
    const schedule = await SchedulerService.generateSchedule(userId, today, days);
    await SchedulerService.saveSchedule(userId, schedule, today, days);
  } catch (error) {
    console.error('Failed to sync schedule after todo change:', error);
  }
};

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const todos = db.prepare(`
    SELECT t.*, 
      CASE 
        WHEN t.relatedType = 'internship_task' THEN i1.workingDays
        WHEN t.relatedType = 'internship_subtask' THEN i2.workingDays
        ELSE NULL
      END as workingDays
    FROM todos t
    LEFT JOIN internship_tasks it1 ON t.relatedType = 'internship_task' AND t.relatedId = it1.id
    LEFT JOIN internships i1 ON it1.internshipId = i1.id
    LEFT JOIN internship_subtasks ist ON t.relatedType = 'internship_subtask' AND t.relatedId = ist.id
    LEFT JOIN internship_tasks it2 ON ist.taskId = it2.id
    LEFT JOIN internships i2 ON it2.internshipId = i2.id
    WHERE t.userId = ?
  `).all(req.user!.id);
  res.json(todos);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { activity, date, priority, fixedTime, duration, relatedType, relatedId, deadline, type } = req.body;
  const normalizedFixedTime = fixedTime && fixedTime.trim() !== '' ? fixedTime : null;
  const normalizedPriority = priority && priority.trim() !== '' ? priority : null;
  const normalizedType = type || 'task';
  const result = db.prepare(`
    INSERT INTO todos (userId, activity, date, priority, fixedTime, duration, relatedType, relatedId, deadline, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user!.id, activity, date, normalizedPriority, normalizedFixedTime, duration, relatedType, relatedId, deadline, normalizedType);
  
  await syncUserSchedule(req.user!.id);
  
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { status, note, activity, date, priority, fixedTime, duration, deadline, type } = req.body;
  
  if (status) {
    db.prepare('UPDATE todos SET status = ? WHERE id = ?').run(status, req.params.id);
    
    // Sync back to internship_subtasks if applicable
    const todo = db.prepare('SELECT relatedType, relatedId FROM todos WHERE id = ?').get(req.params.id) as any;
    if (todo && todo.relatedType === 'internship_subtask') {
      db.prepare('UPDATE internship_subtasks SET status = ? WHERE id = ?').run(status, todo.relatedId);
    }
    
    // Check and update streak
    StreakService.updateStreak(req.user!.id).catch(err => console.error('Streak update error:', err));
  }
  if (note !== undefined) db.prepare('UPDATE todos SET note = ? WHERE id = ?').run(note, req.params.id);
  if (activity) db.prepare('UPDATE todos SET activity = ? WHERE id = ?').run(activity, req.params.id);
  if (date) db.prepare('UPDATE todos SET date = ? WHERE id = ?').run(date, req.params.id);
  if (deadline !== undefined) db.prepare('UPDATE todos SET deadline = ? WHERE id = ?').run(deadline, req.params.id);
  if (type) db.prepare('UPDATE todos SET type = ? WHERE id = ?').run(type, req.params.id);
  if (priority !== undefined) {
    const normalizedPriority = priority && priority.trim() !== '' ? priority : null;
    db.prepare('UPDATE todos SET priority = ? WHERE id = ?').run(normalizedPriority, req.params.id);
  }
  if (fixedTime !== undefined) {
    const normalizedFixedTime = fixedTime && fixedTime.trim() !== '' ? fixedTime : null;
    db.prepare('UPDATE todos SET fixedTime = ? WHERE id = ?').run(normalizedFixedTime, req.params.id);
  }
  if (duration !== undefined) db.prepare('UPDATE todos SET duration = ? WHERE id = ?').run(duration, req.params.id);
  
  await syncUserSchedule(req.user!.id);
  
  res.json({ message: 'Todo updated' });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const todoId = parseInt(req.params.id);

  try {
    if (isNaN(todoId)) {
      return res.status(400).json({ error: 'Invalid todo ID' });
    }

    const result = db.prepare('DELETE FROM todos WHERE id = ? AND userId = ?').run(todoId, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Todo not found or unauthorized' });
    }

    // Run sync in background to not block the response
    syncUserSchedule(userId).catch(err => console.error('Background sync error:', err));
    
    res.json({ message: 'Todo deleted' });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

router.delete('/related/:type/:id', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { type, id } = req.params;
  
  try {
    if (id === 'all') {
      db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ?').run(userId, type);
    } else {
      db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?').run(userId, type, id);
    }
    await syncUserSchedule(userId);
    res.json({ message: 'Related todos deleted' });
  } catch (error) {
    console.error('Delete related todos error:', error);
    res.status(500).json({ error: 'Failed to delete related todos' });
  }
});

export default router;
