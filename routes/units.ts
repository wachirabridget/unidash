import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { format, addDays, parseISO, endOfMonth } from 'date-fns';

const router = express.Router();

const syncUserSchedule = async (userId: number) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const days = 365;
    const schedule = await SchedulerService.generateSchedule(userId, today, days);
    await SchedulerService.saveSchedule(userId, schedule, today, days);
  } catch (error) {
    console.error('Failed to sync schedule after unit change:', error);
  }
};

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const units = db.prepare('SELECT * FROM units WHERE userId = ?').all(req.user!.id);
  res.json(units);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { unitName, classDays, classTime, duration, sessions } = req.body;
  const result = db.prepare(`
    INSERT INTO units (userId, unitName, classDays, classTime, duration, sessions)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.id, 
    unitName, 
    JSON.stringify(classDays || []), 
    classTime || '', 
    duration || 0,
    sessions ? JSON.stringify(sessions) : null
  );
  
  await syncUserSchedule(req.user!.id);
  
  res.status(201).json({ id: result.lastInsertRowid });
});

router.post('/exams', authenticateToken, async (req: AuthRequest, res) => {
  const { unitId, type, dateTime } = req.body;
  const userId = req.user!.id;

  // Validation: Date cannot be in the past
  if (new Date(dateTime) < new Date()) {
    return res.status(400).json({ error: `Cannot schedule a ${type} in the past.` });
  }

  // Validation: Only one EXAM allowed per unit. Multiple CATs are allowed.
  if (type === 'EXAM') {
    const existingExam = db.prepare("SELECT id FROM exams_cats WHERE userId = ? AND unitId = ? AND type = 'EXAM'").get(userId, unitId);
    if (existingExam) {
      return res.status(400).json({ error: 'This unit already has a scheduled exam.' });
    }
  }

  // Optional: Prevent exact duplicate CATs (same unit, same time)
  if (type === 'CAT') {
    const duplicateCat = db.prepare("SELECT id FROM exams_cats WHERE userId = ? AND unitId = ? AND type = 'CAT' AND dateTime = ?").get(userId, unitId, dateTime);
    if (duplicateCat) {
      return res.status(400).json({ error: 'A CAT for this unit is already scheduled at this exact time.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO exams_cats (userId, unitId, type, dateTime)
    VALUES (?, ?, ?, ?)
  `).run(userId, unitId, type, dateTime);
  
  await syncUserSchedule(userId);
  
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/exams', authenticateToken, (req: AuthRequest, res) => {
  const exams = db.prepare(`
    SELECT e.*, u.unitName 
    FROM exams_cats e 
    JOIN units u ON e.unitId = u.id 
    WHERE e.userId = ?
  `).all(req.user!.id);
  res.json(exams);
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { unitName, classDays, classTime, duration, sessions } = req.body;
  const { id } = req.params;
  
  db.prepare(`
    UPDATE units 
    SET unitName = ?, classDays = ?, classTime = ?, duration = ?, sessions = ?
    WHERE id = ? AND userId = ?
  `).run(
    unitName, 
    JSON.stringify(classDays || []), 
    classTime || '', 
    duration || 0,
    sessions ? JSON.stringify(sessions) : null,
    id, 
    req.user!.id
  );
  
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Unit updated successfully' });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const unitId = Number(id);
  
  try {
    const deleteTransaction = db.transaction(() => {
      // Get all exams for this unit to delete their revision plans
      const exams = db.prepare('SELECT id FROM exams_cats WHERE unitId = ? AND userId = ?').all(unitId, userId) as any[];
      for (const exam of exams) {
        db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?').run(userId, 'exam', exam.id);
      }
      
      // Delete study plan tasks for this unit
      db.prepare("DELETE FROM todos WHERE userId = ? AND relatedType = 'study_plan' AND relatedId = ?").run(userId, unitId);
      
      db.prepare('DELETE FROM exams_cats WHERE unitId = ? AND userId = ?').run(unitId, userId);
      db.prepare('DELETE FROM units WHERE id = ? AND userId = ?').run(unitId, userId);
    });

    deleteTransaction();
    
    await syncUserSchedule(userId);
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

router.put('/exams/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { unitId, type, dateTime } = req.body;
  const { id } = req.params;
  const userId = req.user!.id;

  // Validation: Date cannot be in the past
  if (new Date(dateTime) < new Date()) {
    return res.status(400).json({ error: `Cannot schedule a ${type} in the past.` });
  }

  // Validation: Only one EXAM allowed per unit. Multiple CATs are allowed.
  if (type === 'EXAM') {
    const existingExam = db.prepare("SELECT id FROM exams_cats WHERE userId = ? AND unitId = ? AND type = 'EXAM' AND id != ?").get(userId, unitId, id);
    if (existingExam) {
      return res.status(400).json({ error: 'This unit already has a scheduled exam.' });
    }
  }

  // Optional: Prevent exact duplicate CATs (same unit, same time)
  if (type === 'CAT') {
    const duplicateCat = db.prepare("SELECT id FROM exams_cats WHERE userId = ? AND unitId = ? AND type = 'CAT' AND dateTime = ? AND id != ?").get(userId, unitId, dateTime, id);
    if (duplicateCat) {
      return res.status(400).json({ error: 'A CAT for this unit is already scheduled at this exact time.' });
    }
  }
  
  db.prepare(`
    UPDATE exams_cats 
    SET unitId = ?, type = ?, dateTime = ?
    WHERE id = ? AND userId = ?
  `).run(unitId, type, dateTime, id, userId);
  
  await syncUserSchedule(userId);
  res.json({ message: 'Exam/CAT updated successfully' });
});

router.delete('/exams/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  
  // Delete related revision plan todos
  db.prepare('DELETE FROM todos WHERE userId = ? AND relatedType = ? AND relatedId = ?').run(userId, 'exam', id);
  
  db.prepare('DELETE FROM exams_cats WHERE id = ? AND userId = ?').run(id, userId);
  
  await syncUserSchedule(userId);
  res.json({ message: 'Exam/CAT deleted successfully' });
});

router.post('/generate-study-plan', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { plan } = req.body; // Plan generated by AI on frontend
  
  try {
    // Delete old study plan todos
    db.prepare("DELETE FROM todos WHERE userId = ? AND relatedType = 'study_plan'").run(userId);
    
    const insert = db.prepare(`
      INSERT INTO todos (userId, activity, date, priority, duration, relatedType, relatedId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const user = db.prepare('SELECT semesterStartMonth, semesterEndMonth, examStartDate FROM users WHERE id = ?').get(userId) as any;
    
    const transaction = db.transaction((tasks) => {
      // Calculate how many days to spread the tasks over
      const now = new Date();
      let semesterEndDate: Date;
      
      if (user?.examStartDate) {
        semesterEndDate = parseISO(user.examStartDate);
      } else {
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const endIdx = months.indexOf((user?.semesterEndMonth || 'December').toLowerCase());
        semesterEndDate = endOfMonth(new Date(now.getFullYear(), endIdx));
        
        const startIdx = months.indexOf((user?.semesterStartMonth || 'January').toLowerCase());
        if (endIdx < startIdx && now.getMonth() >= startIdx) {
          semesterEndDate = endOfMonth(new Date(now.getFullYear() + 1, endIdx));
        }
      }

      // spreadDays should be the number of days from today until the semester end
      let spreadDays = Math.max(14, Math.floor((semesterEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      
      // If semester end is in the past, default to a reasonable window (e.g., 30 days)
      if (semesterEndDate < now) {
        spreadDays = 30;
      }

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        // Spread tasks evenly over the REMAINING semester duration
        const dayOffset = Math.floor((i / tasks.length) * spreadDays);
        const taskDate = format(addDays(now, dayOffset), 'yyyy-MM-dd');
        
        insert.run(
          userId, 
          `Study: ${task.topic} (${task.unitName})`, 
          taskDate, 
          'medium', 
          task.duration, 
          'study_plan', 
          task.unitId
        );
      }
    });
    
    transaction(plan);
    await syncUserSchedule(userId);
    
    res.json({ message: 'Study plan generated successfully' });
  } catch (error) {
    console.error('Generate study plan error:', error);
    res.status(500).json({ error: 'Failed to generate study plan' });
  }
});

router.delete('/clear-all', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  
  try {
    const clearTransaction = db.transaction(() => {
      // Delete all study plan and exam revision todos
      db.prepare("DELETE FROM todos WHERE userId = ? AND relatedType IN ('study_plan', 'exam')").run(userId);
      
      // Delete all exams/cats
      db.prepare('DELETE FROM exams_cats WHERE userId = ?').run(userId);
      
      // Delete all units
      db.prepare('DELETE FROM units WHERE userId = ?').run(userId);
      
      // Clear exam period in users table
      db.prepare('UPDATE users SET examStartDate = NULL, examEndDate = NULL WHERE id = ?').run(userId);
    });

    clearTransaction();
    
    // Schedule will be synced by the caller or by a separate call
    res.json({ message: 'All academic data cleared successfully' });
  } catch (error) {
    console.error('Error clearing academic data:', error);
    res.status(500).json({ error: 'Failed to clear academic data' });
  }
});

export default router;
