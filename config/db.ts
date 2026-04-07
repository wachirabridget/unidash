import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('unidash.db');

// Initialize tables
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      course TEXT,
      yearOfStudy INTEGER,
      semesterType TEXT,
      semesterStartMonth TEXT,
      semesterEndMonth TEXT,
      restDay TEXT,
      concentrationProfile TEXT,
      streak INTEGER DEFAULT 0,
      lastStreakUpdate TEXT,
      examStartDate TEXT,
      examEndDate TEXT
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      unitName TEXT NOT NULL,
      classDays TEXT NOT NULL, -- JSON array (legacy)
      classTime TEXT NOT NULL, -- (legacy)
      duration INTEGER NOT NULL, -- (legacy)
      sessions TEXT, -- JSON array of {day, startTime, duration}
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exams_cats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      unitId INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'CAT' | 'EXAM'
      dateTime TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (unitId) REFERENCES units(id)
    );

    CREATE TABLE IF NOT EXISTS internships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      workType TEXT NOT NULL,
      workingDays TEXT NOT NULL, -- JSON array
      workingHours TEXT NOT NULL,
      role TEXT NOT NULL,
      periodMonths INTEGER,
      startMonth TEXT,
      startYear INTEGER,
      endMonth TEXT,
      endYear INTEGER,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS internship_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internshipId INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (internshipId) REFERENCES internships(id)
    );

    CREATE TABLE IF NOT EXISTS internship_subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (taskId) REFERENCES internship_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      projectName TEXT NOT NULL,
      description TEXT,
      deadline TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      title TEXT NOT NULL,
      estimatedDuration INTEGER NOT NULL, -- in minutes
      status TEXT DEFAULT 'pending',
      note TEXT,
      FOREIGN KEY (projectId) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS bootcamps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'guided' | 'self'
      period TEXT NOT NULL,
      classDays TEXT, -- JSON array (for guided, legacy)
      classTime TEXT, -- for guided, legacy
      duration INTEGER, -- for guided, legacy
      startMonth TEXT,
      startYear INTEGER,
      endMonth TEXT,
      endYear INTEGER,
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bootcamp_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bootcampId INTEGER NOT NULL,
      date TEXT NOT NULL,
      startTime TEXT NOT NULL,
      endTime TEXT,
      duration INTEGER, -- in minutes
      FOREIGN KEY (bootcampId) REFERENCES bootcamps(id)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      activity TEXT NOT NULL,
      date TEXT NOT NULL,
      priority TEXT,
      fixedTime TEXT, -- optional
      duration INTEGER DEFAULT 30, -- default 30 mins if not fixed
      status TEXT DEFAULT 'pending',
      note TEXT,
      relatedType TEXT, -- 'exam' | 'project' | etc.
      relatedId INTEGER,
      deadline TEXT, -- optional, for tasks with specific deadlines
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS schedule_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL, -- 'class' | 'work' | 'exam' | 'cat' | 'bootcamp' | 'study' | 'project' | 'internship_task' | 'todo'
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      relatedId INTEGER, -- ID of the related entity
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS hydration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount_ml INTEGER NOT NULL, -- in milliliters
      date TEXT NOT NULL, -- YYYY-MM-DD
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);

  // Add note column to existing tables if missing
  try { db.exec("ALTER TABLE units ADD COLUMN sessions TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE project_tasks ADD COLUMN note TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE todos ADD COLUMN note TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE internships ADD COLUMN startMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE internships ADD COLUMN endMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE bootcamps ADD COLUMN startMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE bootcamps ADD COLUMN startYear INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE bootcamps ADD COLUMN endMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE bootcamps ADD COLUMN endYear INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE todos ADD COLUMN relatedType TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE todos ADD COLUMN relatedId INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE todos ADD COLUMN deadline TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE todos ADD COLUMN type TEXT DEFAULT 'task';"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN semesterStartMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN semesterEndMonth TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN examStartDate TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN examEndDate TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN lastStreakUpdate TEXT;"); } catch (e) {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_exam_per_unit ON exams_cats(userId, unitId) WHERE type = 'EXAM';"); } catch (e) {}
  try { db.exec("ALTER TABLE internships ADD COLUMN startYear INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE internships ADD COLUMN endYear INTEGER;"); } catch (e) {}
}

export default db;
