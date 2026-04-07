import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';
import { StreakService } from '../services/streak.ts';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'unidash-secret-key';

const validatePassword = (password: string) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength) return 'Password must be at least 8 characters long';
  if (!hasUpperCase) return 'Password must contain at least one uppercase letter';
  if (!hasLowerCase) return 'Password must contain at least one lowercase letter';
  if (!hasNumber) return 'Password must contain at least one number';
  if (!hasSpecialChar) return 'Password must contain at least one special character';
  return null;
};

const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

router.get('/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ message: 'Error checking email' });
  }
});

router.post('/register', async (req, res) => {
  const { name, email, password, course, yearOfStudy, semesterType, restDay } = req.body;

  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password, course, yearOfStudy, semesterType, restDay)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, hashedPassword, course, yearOfStudy, semesterType, restDay);
    
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.lastInsertRowid, name, email } });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Error creating user' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, concentrationProfile: user.concentrationProfile } });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in' });
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  
  // Check for streak reset
  await StreakService.checkStreakReset(userId);
  // Also try to update streak (in case they have no tasks today and just opened the app)
  await StreakService.updateStreak(userId);

  const user = db.prepare('SELECT id, name, email, course, yearOfStudy, semesterType, semesterStartMonth, semesterEndMonth, examStartDate, examEndDate, restDay, concentrationProfile, streak, lastStreakUpdate FROM users WHERE id = ?').get(userId);
  res.json(user);
});

router.post('/onboarding', authenticateToken, (req: AuthRequest, res) => {
  const { concentrationProfile } = req.body;
  db.prepare('UPDATE users SET concentrationProfile = ? WHERE id = ?').run(JSON.stringify(concentrationProfile), req.user!.id);
  res.json({ message: 'Onboarding completed' });
});

router.patch('/profile', authenticateToken, (req: AuthRequest, res) => {
  const { yearOfStudy, semesterType, semesterStartMonth, semesterEndMonth, examStartDate, examEndDate, resetAcademicData } = req.body;
  const userId = req.user!.id;
  
  try {
    db.transaction(() => {
      if (resetAcademicData) {
        // Delete todos related to study plan and exams
        db.prepare("DELETE FROM todos WHERE userId = ? AND (relatedType = 'study_plan' OR relatedType = 'exam')").run(userId);
        // Delete exams and CATs
        db.prepare('DELETE FROM exams_cats WHERE userId = ?').run(userId);
        // Delete units
        db.prepare('DELETE FROM units WHERE userId = ?').run(userId);
        // Clear schedule
        db.prepare('DELETE FROM schedule_items WHERE userId = ?').run(userId);
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (yearOfStudy !== undefined) {
        updates.push('yearOfStudy = ?');
        params.push(yearOfStudy);
      }
      if (semesterType !== undefined) {
        updates.push('semesterType = ?');
        params.push(semesterType);
      }
      if (semesterStartMonth !== undefined) {
        updates.push('semesterStartMonth = ?');
        params.push(semesterStartMonth);
      }
      if (semesterEndMonth !== undefined) {
        updates.push('semesterEndMonth = ?');
        params.push(semesterEndMonth);
      }
      
      // If resetting, we also clear exam dates in the users table
      if (resetAcademicData) {
        updates.push('examStartDate = NULL');
        updates.push('examEndDate = NULL');
      } else {
        if (examStartDate !== undefined) {
          updates.push('examStartDate = ?');
          params.push(examStartDate);
        }
        if (examEndDate !== undefined) {
          updates.push('examEndDate = ?');
          params.push(examEndDate);
        }
      }

      if (updates.length > 0) {
        params.push(userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    })();
    res.json({ message: 'Profile updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

router.delete('/account', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user!.id;

  try {
    db.transaction(() => {
      // Delete internship subtasks
      db.prepare(`
        DELETE FROM internship_subtasks 
        WHERE taskId IN (
          SELECT id FROM internship_tasks 
          WHERE internshipId IN (
            SELECT id FROM internships WHERE userId = ?
          )
        )
      `).run(userId);

      // Delete internship tasks
      db.prepare(`
        DELETE FROM internship_tasks 
        WHERE internshipId IN (
          SELECT id FROM internships WHERE userId = ?
        )
      `).run(userId);

      // Delete internships
      db.prepare('DELETE FROM internships WHERE userId = ?').run(userId);

      // Delete project tasks
      db.prepare(`
        DELETE FROM project_tasks 
        WHERE projectId IN (SELECT id FROM projects WHERE userId = ?)
      `).run(userId);

      // Delete projects
      db.prepare('DELETE FROM projects WHERE userId = ?').run(userId);

      // Delete bootcamp sessions
      db.prepare(`
        DELETE FROM bootcamp_sessions 
        WHERE bootcampId IN (SELECT id FROM bootcamps WHERE userId = ?)
      `).run(userId);

      // Delete bootcamps
      db.prepare('DELETE FROM bootcamps WHERE userId = ?').run(userId);

      // Delete units
      db.prepare('DELETE FROM units WHERE userId = ?').run(userId);

      // Delete exams/cats
      db.prepare('DELETE FROM exams_cats WHERE userId = ?').run(userId);

      // Delete todos
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);

      // Delete schedule items
      db.prepare('DELETE FROM schedule_items WHERE userId = ?').run(userId);

      // Finally delete user
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    })();

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting account' });
  }
});

router.patch('/account/update', authenticateToken, async (req: AuthRequest, res) => {
  const { name, email, password } = req.body;
  const userId = req.user!.id;

  try {
    const updates: string[] = [];
    const params: any[] = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }

    if (email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      // Check if email already exists for another user
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email);
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length > 0) {
      params.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      res.json({ message: 'Account updated successfully' });
    } else {
      res.status(400).json({ message: 'No updates provided' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating account' });
  }
});

export default router;
