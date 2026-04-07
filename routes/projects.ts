import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { format } from 'date-fns';

const router = express.Router();

const syncUserSchedule = async (userId: number) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const days = 7;
    const schedule = await SchedulerService.generateSchedule(userId, today, days);
    await SchedulerService.saveSchedule(userId, schedule, today, days);
  } catch (error) {
    console.error('Failed to sync schedule after project change:', error);
  }
};

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const projects = db.prepare('SELECT * FROM projects WHERE userId = ?').all(req.user!.id) as any[];
  const projectsWithTasks = projects.map(p => {
    const tasks = db.prepare('SELECT * FROM project_tasks WHERE projectId = ?').all(p.id);
    return { ...p, tasks };
  });
  res.json(projectsWithTasks);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { projectName, description, deadline, tasks } = req.body;
  const userId = req.user!.id;
  
  if (!projectName || !description || !deadline) {
    return res.status(400).json({ error: 'Project name, description, and deadline are required.' });
  }

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'A project breakdown is mandatory before saving.' });
  }

  const existing = db.prepare('SELECT id FROM projects WHERE userId = ? AND LOWER(projectName) = LOWER(?) AND LOWER(description) = LOWER(?)')
    .get(userId, projectName.trim(), description.trim());

  if (existing && !req.body.ignoreDuplicate) {
    return res.status(409).json({ error: 'DUPLICATE_PROJECT', message: 'A similar project already exists.' });
  }

  const deadlineDate = new Date(deadline);
  const now = new Date();
  if (deadlineDate < now) {
    return res.status(400).json({ error: 'Deadline cannot be set to a past time.' });
  }

  const result = db.prepare(`
    INSERT INTO projects (userId, projectName, description, deadline)
    VALUES (?, ?, ?, ?)
  `).run(userId, projectName, description, deadline);
  
  const projectId = result.lastInsertRowid;
  
  const insertTask = db.prepare(`
    INSERT INTO project_tasks (projectId, title, estimatedDuration)
    VALUES (?, ?, ?)
  `);

  const insertTodo = db.prepare(`
    INSERT INTO todos (userId, activity, date, duration, relatedType, relatedId, deadline, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Distribute tasks logically between now and deadline
  const diffMs = deadlineDate.getTime() - now.getTime();
  const intervalMs = diffMs / (tasks.length + 1);

  tasks.forEach((t, index) => {
    const taskResult = insertTask.run(projectId, t.title, t.duration);
    const taskId = taskResult.lastInsertRowid;

    const scheduledDate = new Date(now.getTime() + intervalMs * (index + 1));
    insertTodo.run(
      userId,
      `Project: ${projectName} - ${t.title}`,
      format(scheduledDate, 'yyyy-MM-dd'),
      t.duration,
      'project_task',
      taskId,
      deadline,
      'medium'
    );
  });
  
  await syncUserSchedule(userId);
  
  res.status(201).json({ id: projectId });
});

router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { projectName, description, deadline, tasks } = req.body;
  const projectId = req.params.id;
  const userId = req.user!.id;

  if (!projectName || !description || !deadline) {
    return res.status(400).json({ error: 'Project name, description, and deadline are required.' });
  }

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'A project breakdown is mandatory before saving.' });
  }

  const existing = db.prepare('SELECT id FROM projects WHERE userId = ? AND id != ? AND LOWER(projectName) = LOWER(?) AND LOWER(description) = LOWER(?)')
    .get(userId, projectId, projectName.trim(), description.trim());

  if (existing && !req.body.ignoreDuplicate) {
    return res.status(409).json({ error: 'DUPLICATE_PROJECT', message: 'A similar project already exists.' });
  }

  const deadlineDate = new Date(deadline);
  const now = new Date();
  if (deadlineDate < now) {
    return res.status(400).json({ error: 'Deadline cannot be set to a past time.' });
  }

  db.prepare(`
    UPDATE projects 
    SET projectName = ?, description = ?, deadline = ?
    WHERE id = ? AND userId = ?
  `).run(projectName, description, deadline, projectId, userId);

  // Delete existing tasks and their todos
  const existingTasks = db.prepare('SELECT id FROM project_tasks WHERE projectId = ?').all(projectId) as any[];
  const taskIds = existingTasks.map(t => t.id);
  
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM todos WHERE relatedType = 'project_task' AND relatedId IN (${placeholders})`).run(...taskIds);
    db.prepare('DELETE FROM project_tasks WHERE projectId = ?').run(projectId);
  }
  
  const insertTask = db.prepare(`
    INSERT INTO project_tasks (projectId, title, estimatedDuration)
    VALUES (?, ?, ?)
  `);

  const insertTodo = db.prepare(`
    INSERT INTO todos (userId, activity, date, duration, relatedType, relatedId, deadline, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Distribute tasks logically between now and deadline
  const diffMs = deadlineDate.getTime() - now.getTime();
  const intervalMs = diffMs / (tasks.length + 1);

  tasks.forEach((t, index) => {
    const taskResult = insertTask.run(projectId, t.title, t.duration);
    const taskId = taskResult.lastInsertRowid;

    const scheduledDate = new Date(now.getTime() + intervalMs * (index + 1));
    insertTodo.run(
      userId,
      `Project: ${projectName} - ${t.title}`,
      format(scheduledDate, 'yyyy-MM-dd'),
      t.duration,
      'project_task',
      taskId,
      deadline,
      'medium'
    );
  });

  await syncUserSchedule(userId);
  res.json({ message: 'Project updated' });
});

router.patch('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { status, note } = req.body;
  const taskId = req.params.id;

  if (status) {
    db.prepare('UPDATE project_tasks SET status = ? WHERE id = ?').run(status, taskId);
    // Sync to todo
    db.prepare("UPDATE todos SET status = ? WHERE relatedType = 'project_task' AND relatedId = ?").run(status, taskId);
  }
  if (note !== undefined) {
    db.prepare('UPDATE project_tasks SET note = ? WHERE id = ?').run(note, taskId);
    // Sync to todo
    db.prepare("UPDATE todos SET note = ? WHERE relatedType = 'project_task' AND relatedId = ?").run(note, taskId);
  }
  
  await syncUserSchedule(req.user!.id);
  
  res.json({ message: 'Task updated' });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const projectId = req.params.id;
  const userId = req.user!.id;
  
  const existingTasks = db.prepare('SELECT id FROM project_tasks WHERE projectId = ?').all(projectId) as any[];
  const taskIds = existingTasks.map(t => t.id);
  
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM todos WHERE relatedType = 'project_task' AND relatedId IN (${placeholders})`).run(...taskIds);
    db.prepare('DELETE FROM project_tasks WHERE projectId = ?').run(projectId);
  }

  db.prepare('DELETE FROM projects WHERE id = ? AND userId = ?').run(projectId, userId);
  
  await syncUserSchedule(userId);
  res.json({ message: 'Project deleted' });
});

export default router;
