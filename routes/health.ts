import express from 'express';
import db from '../config/db.ts';
import { authenticateToken, AuthRequest } from '../middleware/auth.ts';

const router = express.Router();

// Get today's hydration progress
router.get('/hydration/today', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const logs = db.prepare('SELECT SUM(amount_ml) as total FROM hydration_logs WHERE userId = ? AND date = ?').get(userId, today) as { total: number | null };
    res.json({ total: logs.total || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching hydration data' });
  }
});

// Log water intake
router.post('/hydration', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { amount_ml } = req.body;
  const today = new Date().toISOString().split('T')[0];

  if (!amount_ml || amount_ml <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  try {
    db.prepare('INSERT INTO hydration_logs (userId, amount_ml, date) VALUES (?, ?, ?)').run(userId, amount_ml, today);
    res.json({ message: 'Water intake logged' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error logging hydration' });
  }
});

// Reset today's hydration
router.delete('/hydration/today', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    db.prepare('DELETE FROM hydration_logs WHERE userId = ? AND date = ?').run(userId, today);
    res.json({ message: 'Hydration reset' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error resetting hydration' });
  }
});

export default router;
