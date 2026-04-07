import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { format, addDays, differenceInDays, parseISO, startOfDay } from 'date-fns';

const router = express.Router();

const scheduleInternshipTaskBreakdown = async (userId: number, taskId: number) => {
  const task = db.prepare(`
    SELECT it.*, i.workingDays, i.workingHours 
    FROM internship_tasks it 
    JOIN internships i ON it.internshipId = i.id 
    WHERE it.id = ?
  `).get(taskId) as any;
  if (!task) return;

  const subtasks = db.prepare('SELECT * FROM internship_subtasks WHERE taskId = ?').all(taskId) as any[];
  if (subtasks.length === 0) return;

  // Delete existing todos for this task and its subtasks
  db.prepare(`
    DELETE FROM todos 
    WHERE userId = ? 
    AND (
      (relatedType = 'internship_task' AND relatedId = ?) OR
      (relatedType = 'internship_subtask' AND relatedId IN (SELECT id FROM internship_subtasks WHERE taskId = ?))
    )
  `).run(userId, taskId, taskId);

  const workingDays = typeof task.workingDays === 'string' ? JSON.parse(task.workingDays || '[]') : (task.workingDays || []);
  const now = new Date();
  const deadline = parseISO(task.deadline);
  
  // Fetch user profile to check preferred study hours
  const user = db.prepare('SELECT concentrationProfile FROM users WHERE id = ?').get(userId) as any;
  const profile = user.concentrationProfile ? (typeof user.concentrationProfile === 'string' ? JSON.parse(user.concentrationProfile) : user.concentrationProfile) : { preferredStudyHours: [8, 22] };
  const endHour = profile.preferredStudyHours[1];

  // Find all valid working days between today and deadline
  const availableDays: string[] = [];
  let checkDate = startOfDay(now);
  
  // If it's already past the study hours today, start from tomorrow
  if (now.getHours() >= endHour) {
    checkDate = addDays(checkDate, 1);
  }

  while (checkDate <= deadline) {
    const dayName = format(checkDate, 'EEEE');
    if (workingDays.length === 0 || workingDays.includes(dayName)) {
      availableDays.push(format(checkDate, 'yyyy-MM-dd'));
    }
    checkDate = addDays(checkDate, 1);
  }

  // If no working days found, fallback to all days (starting from checkDate)
  if (availableDays.length === 0) {
    let fallbackDate = startOfDay(now);
    if (now.getHours() >= endHour) {
      fallbackDate = addDays(fallbackDate, 1);
    }
    while (fallbackDate <= deadline) {
      availableDays.push(format(fallbackDate, 'yyyy-MM-dd'));
      fallbackDate = addDays(fallbackDate, 1);
    }
  }

  // Final check: if still no days (e.g., deadline is today and it's late), 
  // we must at least schedule it for today or tomorrow to avoid losing tasks.
  if (availableDays.length === 0) {
    availableDays.push(format(now, 'yyyy-MM-dd'));
  }

  const insertTodo = db.prepare(`
    INSERT INTO todos (userId, activity, date, priority, status, relatedType, relatedId, duration, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Intelligent distribution:
  // 1. Calculate subtasks per day
  // 2. If it's today, check if we still have time
  const subtasksPerDay = Math.ceil(subtasks.length / availableDays.length);
  
  subtasks.forEach((subtask, index) => {
    const dayIndex = Math.min(availableDays.length - 1, Math.floor(index / subtasksPerDay));
    const scheduledDate = availableDays[dayIndex];
    
    // Default duration based on complexity (simple heuristic: 45 mins)
    // If there are many subtasks on the same day, we might want to reduce duration or just let them stack
    const duration = 45; 
    
    insertTodo.run(
      userId,
      `[Internship: ${task.title}] ${subtask.title}`,
      scheduledDate,
      'medium',
      subtask.status || 'pending',
      'internship_subtask',
      subtask.id,
      duration,
      task.deadline
    );
  });
};

const syncUserSchedule = async (userId: number) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const days = 365;
    const schedule = await SchedulerService.generateSchedule(userId, today, days);
    await SchedulerService.saveSchedule(userId, schedule, today, days);
  } catch (error) {
    console.error('Failed to sync schedule after internship change:', error);
  }
};

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const internships = db.prepare('SELECT * FROM internships WHERE userId = ?').all(req.user!.id) as any[];
  const withTasks = internships.map(i => {
    const tasks = db.prepare('SELECT * FROM internship_tasks WHERE internshipId = ?').all(i.id) as any[];
    const tasksWithSubtasks = tasks.map(t => {
      const subtasks = db.prepare(`
        SELECT s.*, t.date as scheduledDate 
        FROM internship_subtasks s
        LEFT JOIN todos t ON t.relatedType = 'internship_subtask' AND t.relatedId = s.id
        WHERE s.taskId = ?
      `).all(t.id);
      return { ...t, subtasks };
    });
    return { ...i, tasks: tasksWithSubtasks };
  });
  res.json(withTasks);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { workType, workingDays, workingHours, role, periodMonths, startMonth, endMonth, startYear, endYear } = req.body;
  
  if (!workingDays || !Array.isArray(workingDays) || workingDays.length === 0) {
    return res.status(400).json({ error: 'Please select at least one working day to save your internship.' });
  }

  // Validate start date <= end date
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const startIdx = months.indexOf(startMonth);
  const endIdx = months.indexOf(endMonth);
  if (startIdx !== -1 && endIdx !== -1 && startYear && endYear) {
    const startDate = new Date(startYear, startIdx, 1);
    const endDate = new Date(endYear, endIdx, 1);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'Start date cannot be after the end date.' });
    }
  }

  let calculatedPeriod = periodMonths;
  if (!calculatedPeriod && startMonth && endMonth && startYear && endYear) {
    const startDate = new Date(startYear, startIdx, 1);
    const endDate = new Date(endYear, endIdx, 1);
    calculatedPeriod = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
  }
  if (calculatedPeriod === undefined || calculatedPeriod === null) calculatedPeriod = 0;

  const result = db.prepare(`
    INSERT INTO internships (userId, workType, workingDays, workingHours, role, periodMonths, startMonth, startYear, endMonth, endYear)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user!.id, workType, JSON.stringify(workingDays), workingHours, role, calculatedPeriod, startMonth, startYear, endMonth, endYear);
  
  await syncUserSchedule(req.user!.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Specific task/subtask routes first
router.patch('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { status } = req.body;
  db.prepare('UPDATE internship_tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  
  // If task is completed, mark all subtasks and todos as completed
  if (status === 'completed') {
    db.prepare('UPDATE internship_subtasks SET status = ? WHERE taskId = ?').run('completed', req.params.id);
    db.prepare('UPDATE todos SET status = ? WHERE relatedType = ? AND relatedId = ?').run('completed', 'internship_task', req.params.id);
  }

  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Task updated' });
});

router.put('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { title, description, deadline, subtasks, force } = req.body;
  
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: 'Task description is required to save this task.' });
  }

  if (!subtasks || !Array.isArray(subtasks) || subtasks.length === 0) {
    return res.status(400).json({ error: 'A task breakdown is mandatory before saving.' });
  }

  const task = db.prepare(`
    SELECT t.*, i.startMonth, i.startYear, i.endMonth, i.endYear, i.id as internshipId
    FROM internship_tasks t
    JOIN internships i ON t.internshipId = i.id
    WHERE t.id = ?
  `).get(req.params.id) as any;

  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Soft duplicate check: title AND description (case-insensitive and trimmed)
  if (!force) {
    const duplicate = db.prepare(`
      SELECT id FROM internship_tasks 
      WHERE internshipId = ? 
      AND LOWER(TRIM(title)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(description)) = LOWER(TRIM(?)) 
      AND id != ?
    `).get(task.internshipId, title, description, req.params.id);

    if (duplicate) {
      return res.status(200).json({ 
        warning: 'A similar task already exists. Do you want to continue?',
        isDuplicate: true 
      });
    }
  }

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    if (deadlineDate < now) {
      return res.status(400).json({ error: 'Deadline cannot be set to a past time.' });
    }

    // Validate deadline within internship period
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const startIdx = months.indexOf(task.startMonth);
    const endIdx = months.indexOf(task.endMonth);
    const startYear = task.startYear || now.getFullYear();
    const endYear = task.endYear || startYear;

    if (startIdx !== -1 && endIdx !== -1) {
      const startDate = new Date(startYear, startIdx, 1);
      const endDate = new Date(endYear, endIdx, 1);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);

      if (deadlineDate < startDate || deadlineDate > endDate) {
        return res.status(400).json({ 
          error: `Deadline must be within the internship period (${task.startMonth} ${startYear} - ${task.endMonth} ${endYear}).` 
        });
      }
    }
  }

  db.prepare(`
    UPDATE internship_tasks 
    SET title = ?, description = ?, deadline = ?
    WHERE id = ?
  `).run(title, description, deadline, req.params.id);

  // Delete subtask todos BEFORE deleting subtasks
  db.prepare(`
    DELETE FROM todos 
    WHERE userId = ? 
    AND relatedType = 'internship_subtask' 
    AND relatedId IN (SELECT id FROM internship_subtasks WHERE taskId = ?)
  `).run(req.user!.id, req.params.id);

  db.prepare('DELETE FROM internship_subtasks WHERE taskId = ?').run(req.params.id);

  if (subtasks && Array.isArray(subtasks)) {
    const insertSubtask = db.prepare(`
      INSERT INTO internship_subtasks (taskId, title, status)
      VALUES (?, ?, ?)
    `);
    subtasks.forEach((s: any) => insertSubtask.run(req.params.id, s.title, s.status || 'pending'));
  }

  await scheduleInternshipTaskBreakdown(req.user!.id, parseInt(req.params.id));
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Task updated successfully' });
});

router.delete('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const task = db.prepare(`
    SELECT t.id FROM internship_tasks t
    JOIN internships i ON t.internshipId = i.id
    WHERE t.id = ? AND i.userId = ?
  `).get(req.params.id, req.user!.id);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Delete all subtask todos
  const subtasks = db.prepare('SELECT id FROM internship_subtasks WHERE taskId = ?').all(req.params.id) as any[];
  const deleteTodo = db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?');
  subtasks.forEach(s => {
    deleteTodo.run(req.user!.id, 'internship_subtask', s.id);
  });

  // Delete task todo
  deleteTodo.run(req.user!.id, 'internship_task', req.params.id);

  db.prepare('DELETE FROM internship_subtasks WHERE taskId = ?').run(req.params.id);
  db.prepare('DELETE FROM internship_tasks WHERE id = ?').run(req.params.id);
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Task deleted successfully' });
});

router.patch('/subtasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { status } = req.body;
  const subtask = db.prepare(`
    SELECT s.id FROM internship_subtasks s
    JOIN internship_tasks t ON s.taskId = t.id
    JOIN internships i ON t.internshipId = i.id
    WHERE s.id = ? AND i.userId = ?
  `).get(req.params.id, req.user!.id);

  if (!subtask) {
    return res.status(404).json({ error: 'Subtask not found' });
  }

  db.prepare('UPDATE internship_subtasks SET status = ? WHERE id = ?').run(status, req.params.id);
  
  // Update corresponding todo if it exists
  db.prepare(`
    UPDATE todos 
    SET status = ? 
    WHERE userId = ? AND relatedType = 'internship_subtask' AND relatedId = ?
  `).run(status, req.user!.id, req.params.id);

  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Subtask updated' });
});

router.delete('/subtasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const subtask = db.prepare(`
    SELECT s.id FROM internship_subtasks s
    JOIN internship_tasks t ON s.taskId = t.id
    JOIN internships i ON t.internshipId = i.id
    WHERE s.id = ? AND i.userId = ?
  `).get(req.params.id, req.user!.id);

  if (!subtask) {
    return res.status(404).json({ error: 'Subtask not found' });
  }

  // Delete corresponding todo
  db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?')
    .run(req.user!.id, 'internship_subtask', req.params.id);

  db.prepare('DELETE FROM internship_subtasks WHERE id = ?').run(req.params.id);
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Subtask deleted successfully' });
});

// Generic internship routes last
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { workType, workingDays, workingHours, role, periodMonths, startMonth, startYear, endMonth, endYear } = req.body;
  
  if (!workingDays || !Array.isArray(workingDays) || workingDays.length === 0) {
    return res.status(400).json({ error: 'Please select at least one working day to save your internship.' });
  }

  // Validate start date <= end date
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const startIdx = months.indexOf(startMonth);
  const endIdx = months.indexOf(endMonth);
  if (startIdx !== -1 && endIdx !== -1 && startYear && endYear) {
    const startDate = new Date(startYear, startIdx, 1);
    const endDate = new Date(endYear, endIdx, 1);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'Start date cannot be after the end date.' });
    }
  }

  let calculatedPeriod = periodMonths;
  if (!calculatedPeriod && startMonth && endMonth && startYear && endYear) {
    const startDate = new Date(startYear, startIdx, 1);
    const endDate = new Date(endYear, endIdx, 1);
    calculatedPeriod = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
  }
  if (calculatedPeriod === undefined || calculatedPeriod === null) calculatedPeriod = 0;

  db.prepare(`
    UPDATE internships 
    SET workType = ?, workingDays = ?, workingHours = ?, role = ?, periodMonths = ?, startMonth = ?, startYear = ?, endMonth = ?, endYear = ?
    WHERE id = ? AND userId = ?
  `).run(workType, JSON.stringify(workingDays), workingHours, role, calculatedPeriod, startMonth, startYear, endMonth, endYear, req.params.id, req.user!.id);
  
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Internship updated successfully' });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const internship = db.prepare('SELECT id FROM internships WHERE id = ? AND userId = ?').get(req.params.id, req.user!.id);
  if (!internship) {
    return res.status(404).json({ error: 'Internship not found' });
  }

  const tasks = db.prepare('SELECT id FROM internship_tasks WHERE internshipId = ?').all(req.params.id) as any[];
  const deleteTodo = db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?');
  
  tasks.forEach(t => {
    const subtasks = db.prepare('SELECT id FROM internship_subtasks WHERE taskId = ?').all(t.id) as any[];
    subtasks.forEach(s => {
      deleteTodo.run(req.user!.id, 'internship_subtask', s.id);
    });
    deleteTodo.run(req.user!.id, 'internship_task', t.id);
    db.prepare('DELETE FROM internship_subtasks WHERE taskId = ?').run(t.id);
  });

  db.prepare('DELETE FROM internship_tasks WHERE internshipId = ?').run(req.params.id);
  db.prepare('DELETE FROM internships WHERE id = ? AND userId = ?').run(req.params.id, req.user!.id);
  
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Internship deleted successfully' });
});

router.post('/:id/tasks', authenticateToken, async (req: AuthRequest, res) => {
  const { title, description, deadline, subtasks, force } = req.body;

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: 'Task description is required to save this task.' });
  }

  if (!subtasks || !Array.isArray(subtasks) || subtasks.length === 0) {
    return res.status(400).json({ error: 'A task breakdown is mandatory before saving.' });
  }

  // Soft duplicate check: title AND description (case-insensitive and trimmed)
  if (!force) {
    const duplicate = db.prepare(`
      SELECT id FROM internship_tasks 
      WHERE internshipId = ? 
      AND LOWER(TRIM(title)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(description)) = LOWER(TRIM(?))
    `).get(req.params.id, title, description);

    if (duplicate) {
      return res.status(200).json({ 
        warning: 'A similar task already exists. Do you want to continue?',
        isDuplicate: true 
      });
    }
  }

  const internship = db.prepare('SELECT * FROM internships WHERE id = ?').get(req.params.id) as any;
  if (!internship) return res.status(404).json({ error: 'Internship not found' });

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    if (deadlineDate < now) {
      return res.status(400).json({ error: 'Deadline cannot be set to a past time.' });
    }

    // Validate deadline within internship period
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const startIdx = months.indexOf(internship.startMonth);
    const endIdx = months.indexOf(internship.endMonth);
    const startYear = internship.startYear || now.getFullYear();
    const endYear = internship.endYear || startYear;

    if (startIdx !== -1 && endIdx !== -1) {
      const startDate = new Date(startYear, startIdx, 1);
      const endDate = new Date(endYear, endIdx, 1);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);

      if (deadlineDate < startDate || deadlineDate > endDate) {
        return res.status(400).json({ 
          error: `Deadline must be within the internship period (${internship.startMonth} ${startYear} - ${internship.endMonth} ${endYear}).` 
        });
      }
    }
  }

  const result = db.prepare(`
    INSERT INTO internship_tasks (internshipId, title, description, deadline)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, title, description, deadline);
  
  const taskId = result.lastInsertRowid;

  if (subtasks && Array.isArray(subtasks)) {
    const insertSubtask = db.prepare(`
      INSERT INTO internship_subtasks (taskId, title)
      VALUES (?, ?)
    `);
    subtasks.forEach((s: any) => insertSubtask.run(taskId, s.title));
  }

  await scheduleInternshipTaskBreakdown(req.user!.id, Number(taskId));
  await syncUserSchedule(req.user!.id);
  res.status(201).json({ id: taskId });
});

export default router;
