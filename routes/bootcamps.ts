import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { SchedulerService } from '../services/scheduler.ts';
import { format } from 'date-fns';

const router = express.Router();

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const syncUserSchedule = async (userId: number) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const days = 365;
    const schedule = await SchedulerService.generateSchedule(userId, today, days);
    await SchedulerService.saveSchedule(userId, schedule, today, days);
  } catch (error) {
    console.error('Failed to sync schedule after bootcamp change:', error);
  }
};

router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const bootcamps = db.prepare('SELECT * FROM bootcamps WHERE userId = ?').all(req.user!.id) as any[];
  const bootcampsWithSessions = bootcamps.map(bc => {
    const sessions = db.prepare('SELECT * FROM bootcamp_sessions WHERE bootcampId = ?').all(bc.id);
    return { ...bc, sessions };
  });
  res.json(bootcampsWithSessions);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { name, type, period, classDays, classTime, duration, sessions, startMonth, startYear, endMonth, endYear } = req.body;
  
  if (endYear < startYear) {
    return res.status(400).json({ error: 'End year cannot be earlier than start year.' });
  }

  if (startYear === endYear) {
    const startIdx = months.indexOf(startMonth);
    const endIdx = months.indexOf(endMonth);
    if (endIdx < startIdx) {
      return res.status(400).json({ error: 'End month cannot be earlier than start month for the same year.' });
    }
  }

  const insertBootcamp = db.prepare(`
    INSERT INTO bootcamps (userId, name, type, period, classDays, classTime, duration, startMonth, startYear, endMonth, endYear)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertSession = db.prepare(`
    INSERT INTO bootcamp_sessions (bootcampId, date, startTime, endTime, duration)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const result = insertBootcamp.run(req.user!.id, name, type, period || '', classDays ? JSON.stringify(classDays) : null, classTime, duration, startMonth, startYear, endMonth, endYear);
    const bootcampId = result.lastInsertRowid;

    if (sessions && Array.isArray(sessions)) {
      for (const session of sessions) {
        insertSession.run(bootcampId, session.date, session.startTime, session.endTime || null, session.duration || null);
      }
    }
    return bootcampId;
  });

  const bootcampId = transaction();
  
  await syncUserSchedule(req.user!.id);
  
  res.status(201).json({ id: bootcampId });
});

router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { name, type, period, classDays, classTime, duration, sessions, startMonth, startYear, endMonth, endYear } = req.body;
  
  // Need to fetch current values for partial updates
  const current = db.prepare('SELECT startMonth, startYear, endMonth, endYear FROM bootcamps WHERE id = ?').get(req.params.id) as any;
  if (!current) return res.status(404).json({ error: 'Bootcamp not found' });

  const sYear = startYear !== undefined ? startYear : current.startYear;
  const eYear = endYear !== undefined ? endYear : current.endYear;
  const sMonth = startMonth || current.startMonth;
  const eMonth = endMonth || current.endMonth;

  if (eYear < sYear) {
    return res.status(400).json({ error: 'End year cannot be earlier than start year.' });
  }

  if (sYear === eYear) {
    const startIdx = months.indexOf(sMonth);
    const endIdx = months.indexOf(eMonth);
    if (endIdx < startIdx) {
      return res.status(400).json({ error: 'End month cannot be earlier than start month for the same year.' });
    }
  }

  const transaction = db.transaction(() => {
    if (name) db.prepare('UPDATE bootcamps SET name = ? WHERE id = ?').run(name, req.params.id);
    if (type) db.prepare('UPDATE bootcamps SET type = ? WHERE id = ?').run(type, req.params.id);
    if (period) db.prepare('UPDATE bootcamps SET period = ? WHERE id = ?').run(period, req.params.id);
    if (startMonth) db.prepare('UPDATE bootcamps SET startMonth = ? WHERE id = ?').run(startMonth, req.params.id);
    if (startYear !== undefined) db.prepare('UPDATE bootcamps SET startYear = ? WHERE id = ?').run(startYear, req.params.id);
    if (endMonth) db.prepare('UPDATE bootcamps SET endMonth = ? WHERE id = ?').run(endMonth, req.params.id);
    if (endYear !== undefined) db.prepare('UPDATE bootcamps SET endYear = ? WHERE id = ?').run(endYear, req.params.id);
    if (classDays) db.prepare('UPDATE bootcamps SET classDays = ? WHERE id = ?').run(JSON.stringify(classDays), req.params.id);
    if (classTime) db.prepare('UPDATE bootcamps SET classTime = ? WHERE id = ?').run(classTime, req.params.id);
    if (duration !== undefined) db.prepare('UPDATE bootcamps SET duration = ? WHERE id = ?').run(duration, req.params.id);

    if (sessions && Array.isArray(sessions)) {
      // Replace sessions
      db.prepare('DELETE FROM bootcamp_sessions WHERE bootcampId = ?').run(req.params.id);
      const insertSession = db.prepare(`
        INSERT INTO bootcamp_sessions (bootcampId, date, startTime, endTime, duration)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const session of sessions) {
        insertSession.run(req.params.id, session.date, session.startTime, session.endTime || null, session.duration || null);
      }
    }
  });

  transaction();
  
  await syncUserSchedule(req.user!.id);
  
  res.json({ message: 'Bootcamp updated' });
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM bootcamp_sessions WHERE bootcampId = ?').run(req.params.id);
    db.prepare('DELETE FROM bootcamps WHERE id = ? AND userId = ?').run(req.params.id, req.user!.id);
  });
  
  transaction();
  await syncUserSchedule(req.user!.id);
  res.json({ message: 'Bootcamp deleted' });
});

export default router;
