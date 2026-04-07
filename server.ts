import express from 'express';
import path from "path";
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initDb } from './config/db.ts';
import authRoutes from './routes/auth.ts';
import unitRoutes from './routes/units.ts';
import projectRoutes from './routes/projects.ts';
import internshipRoutes from './routes/internships.ts';
import bootcampRoutes from './routes/bootcamps.ts';
import todoRoutes from './routes/todos.ts';
import scheduleRoutes from './routes/schedule.ts';
import healthRoutes from './routes/health.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Initialize Database
  initDb();

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/units', unitRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/internships', internshipRoutes);
  app.use('/api/bootcamps', bootcampRoutes);
  app.use('/api/todos', todoRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/health', healthRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
