import { addMinutes, format, parseISO, startOfDay, endOfDay, addDays, isWithinInterval, isSameDay, getDay, isBefore, isAfter, endOfMonth } from 'date-fns';
import db from '../config/db.ts';

interface TimeSlot {
  start: Date;
  end: Date;
  type: string;
  title: string;
  relatedId?: number;
  status?: string;
}

export class SchedulerService {
  private static getMonthIndex(monthName: string): number {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return months.indexOf(monthName.trim().toLowerCase());
  }

  private static isWithinMonthRange(date: Date, startMonthName?: string, endMonthName?: string): boolean {
    if (!startMonthName && !endMonthName) return true;
    
    const currentMonth = date.getMonth(); // 0-11
    const startIndex = startMonthName ? this.getMonthIndex(startMonthName) : -1;
    const endIndex = endMonthName ? this.getMonthIndex(endMonthName) : -1;

    if (startIndex === -1 && endIndex === -1) return true;

    // Handle wrap-around (e.g., September to May)
    if (startIndex !== -1 && endIndex !== -1 && startIndex > endIndex) {
      return currentMonth >= startIndex || currentMonth <= endIndex;
    }

    if (startIndex !== -1 && currentMonth < startIndex) return false;
    if (endIndex !== -1 && currentMonth > endIndex) return false;

    return true;
  }

  static async generateSchedule(userId: number, startDateStr: string, days: number = 7) {
    let startDate: Date;
    try {
      startDate = startOfDay(parseISO(startDateStr));
      if (isNaN(startDate.getTime())) {
        startDate = startOfDay(new Date());
      }
    } catch (e) {
      startDate = startOfDay(new Date());
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const profile = user.concentrationProfile ? (typeof user.concentrationProfile === 'string' ? JSON.parse(user.concentrationProfile) : user.concentrationProfile) : {
      preferredStudyHours: [8, 22],
      concentrationDuration: 60,
      workloadTolerance: 'medium'
    };

    const schedule: TimeSlot[] = [];

    // 1. Get Fixed Commitments
    const units = db.prepare('SELECT * FROM units WHERE userId = ?').all(userId) as any[];
    const exams = db.prepare('SELECT e.*, u.unitName FROM exams_cats e JOIN units u ON e.unitId = u.id WHERE e.userId = ?').all(userId) as any[];
    const internships = db.prepare('SELECT * FROM internships WHERE userId = ?').all(userId) as any[];
    const bootcamps = db.prepare('SELECT * FROM bootcamps WHERE userId = ?').all(userId) as any[];
    const fixedTodos = db.prepare("SELECT * FROM todos WHERE userId = ? AND fixedTime IS NOT NULL AND fixedTime != ''").all(userId) as any[];

    for (let i = 0; i < days; i++) {
      const currentDay = addDays(startDate, i);
      const currentDayStr = format(currentDay, 'yyyy-MM-dd');
      const dayOfWeek = format(currentDay, 'EEEE');
      const isRestDay = dayOfWeek === user.restDay;

      // 1. Add Fixed Todos (Highest Priority - User defined)
      fixedTodos.forEach(todo => {
        try {
          if (todo.date === currentDayStr && todo.fixedTime) {
            const parts = todo.fixedTime.split(':');
            if (parts.length !== 2) return;
            const [hours, minutes] = parts.map(Number);
            if (isNaN(hours) || isNaN(minutes)) return;
            const start = addMinutes(startOfDay(currentDay), hours * 60 + minutes);
            const end = addMinutes(start, todo.duration || 60);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              schedule.push({ 
                start, 
                end, 
                type: 'todo', 
                title: todo.activity, 
                relatedId: todo.id, 
                status: todo.status || 'pending' 
              });
            }
          }
        } catch (e) {
          console.error('Error parsing todo time:', e);
        }
      });

        // 1. Check if currentDay is within or after the exam period
        let isExamPeriod = false;
        let isAfterExamPeriod = false;
        if (user.examStartDate && user.examEndDate) {
          const examStart = parseISO(user.examStartDate);
          const examEnd = parseISO(user.examEndDate);
          if (!isNaN(examStart.getTime()) && !isNaN(examEnd.getTime())) {
            isExamPeriod = isWithinInterval(currentDay, { start: examStart, end: examEnd });
            isAfterExamPeriod = isAfter(currentDay, examEnd);
          }
        } else if (user.examEndDate) {
          const examEnd = parseISO(user.examEndDate);
          if (!isNaN(examEnd.getTime())) {
            isAfterExamPeriod = isAfter(currentDay, examEnd);
          }
        }

        // 2. Check if there's an EXAM scheduled for this specific day (CATs don't skip classes)
        const hasExamToday = exams.some(exam => {
          const examDate = parseISO(exam.dateTime);
          return !isNaN(examDate.getTime()) && isSameDay(examDate, currentDay) && exam.type === 'EXAM';
        });

        // Skip classes if it's the exam period OR if there's an exam today OR if it's after the exam period
        if (!isExamPeriod && !hasExamToday && !isAfterExamPeriod) {
          units.forEach(unit => {
            try {
              // Check if currentDay is within user.semesterStartMonth and user.semesterEndMonth
              if (!this.isWithinMonthRange(currentDay, user.semesterStartMonth, user.semesterEndMonth)) return;

              if (unit.sessions) {
                const sessions = typeof unit.sessions === 'string' ? JSON.parse(unit.sessions) : unit.sessions;
                sessions.forEach((session: any) => {
                  if (session.day === dayOfWeek) {
                    const parts = session.startTime.split(':');
                    if (parts.length !== 2) return;
                    const [hours, minutes] = parts.map(Number);
                    if (isNaN(hours) || isNaN(minutes)) return;
                    const start = addMinutes(startOfDay(currentDay), hours * 60 + minutes);
                    const end = addMinutes(start, session.duration || 60);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                      schedule.push({ start, end, type: 'class', title: unit.unitName, relatedId: unit.id, status: 'pending' });
                    }
                  }
                });
              } else if (unit.classDays && unit.classTime) {
                // Legacy support
                const days = typeof unit.classDays === 'string' ? JSON.parse(unit.classDays) : unit.classDays;
                if (days.includes(dayOfWeek)) {
                  const parts = unit.classTime.split(':');
                  if (parts.length !== 2) return;
                  const [hours, minutes] = parts.map(Number);
                  if (isNaN(hours) || isNaN(minutes)) return;
                  const start = addMinutes(startOfDay(currentDay), hours * 60 + minutes);
                  const end = addMinutes(start, unit.duration || 60);
                  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    schedule.push({ start, end, type: 'class', title: unit.unitName, relatedId: unit.id, status: 'pending' });
                  }
                }
              }
            } catch (e) {
              console.error('Error parsing class time:', e);
            }
          });
        }

      // Add Exams/CATs
      exams.forEach(exam => {
        try {
          const examDate = parseISO(exam.dateTime);
          if (isNaN(examDate.getTime())) return;
          if (format(examDate, 'yyyy-MM-dd') === currentDayStr) {
            const start = examDate;
            const end = addMinutes(start, 120); // Default 2 hours
            schedule.push({ start, end, type: exam.type.toLowerCase(), title: `${exam.type}: ${exam.unitName}`, relatedId: exam.id, status: 'pending' });
          }
        } catch (e) {
          console.error('Error parsing exam date:', e);
        }
      });

      // Add Internship Work
      internships.forEach(intern => {
        try {
          if (!intern.workingDays || !intern.workingHours) return;
          
          // Check if currentDay is within intern.startMonth and intern.endMonth
          if (!this.isWithinMonthRange(currentDay, intern.startMonth, intern.endMonth)) return;
          
          const days = typeof intern.workingDays === 'string' ? JSON.parse(intern.workingDays) : intern.workingDays;
          if (days.includes(dayOfWeek)) {
            const times = intern.workingHours.split('-');
            if (times.length !== 2) return;
            const startParts = times[0].split(':');
            const endParts = times[1].split(':');
            if (startParts.length !== 2 || endParts.length !== 2) return;
            
            const [startH, startM] = startParts.map(Number);
            const [endH, endM] = endParts.map(Number);
            
            if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return;

            const start = addMinutes(startOfDay(currentDay), startH * 60 + startM);
            const end = addMinutes(startOfDay(currentDay), endH * 60 + endM);
            
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              schedule.push({ start, end, type: 'work', title: `Internship: ${intern.role}`, relatedId: intern.id, status: 'pending' });
            }
          }
        } catch (e) {
          console.error('Error parsing internship hours:', e);
        }
      });

      // Add Guided Bootcamps (Legacy recurring and New multi-day sessions)
      bootcamps.forEach(bc => {
        try {
          // Check if currentDay is within bc.startMonth and bc.endMonth
          if (!this.isWithinMonthRange(currentDay, bc.startMonth, bc.endMonth)) return;

          // 1. Recurring Bootcamps (Supports both legacy and new per-day config)
          if (bc.classDays) {
            const daysConfig = typeof bc.classDays === 'string' ? JSON.parse(bc.classDays) : bc.classDays;
            
            if (Array.isArray(daysConfig)) {
              // Check if it's the new per-day config format: [{day: 'Monday', time: '10:00', duration: 60}, ...]
              if (daysConfig.length > 0 && typeof daysConfig[0] === 'object') {
                const dayConfig = daysConfig.find(d => d.day === dayOfWeek);
                if (dayConfig) {
                  const parts = dayConfig.time.split(':');
                  if (parts.length === 2) {
                    const [hours, minutes] = parts.map(Number);
                    if (!isNaN(hours) && !isNaN(minutes)) {
                      const start = addMinutes(startOfDay(currentDay), hours * 60 + minutes);
                      const end = addMinutes(start, dayConfig.duration || 60);
                      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        schedule.push({ start, end, type: 'bootcamp', title: `Bootcamp: ${bc.name}`, relatedId: bc.id, status: 'pending' });
                      }
                    }
                  }
                }
              } else {
                // Legacy format: ['Monday', 'Tuesday', ...]
                if (daysConfig.includes(dayOfWeek) && bc.classTime) {
                  const parts = bc.classTime.split(':');
                  if (parts.length === 2) {
                    const [hours, minutes] = parts.map(Number);
                    if (!isNaN(hours) && !isNaN(minutes)) {
                      const start = addMinutes(startOfDay(currentDay), hours * 60 + minutes);
                      const end = addMinutes(start, bc.duration || 60);
                      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        schedule.push({ start, end, type: 'bootcamp', title: `Bootcamp: ${bc.name}`, relatedId: bc.id, status: 'pending' });
                      }
                    }
                  }
                }
              }
            }
          }

          // 2. New Multi-day Bootcamp Sessions
          const sessions = db.prepare('SELECT * FROM bootcamp_sessions WHERE bootcampId = ? AND date = ?').all(bc.id, currentDayStr) as any[];
          sessions.forEach(session => {
            const startParts = session.startTime.split(':');
            if (startParts.length !== 2) return;
            const [sH, sM] = startParts.map(Number);
            const start = addMinutes(startOfDay(currentDay), sH * 60 + sM);
            
            let end: Date;
            if (session.endTime) {
              const endParts = session.endTime.split(':');
              if (endParts.length === 2) {
                const [eH, eM] = endParts.map(Number);
                end = addMinutes(startOfDay(currentDay), eH * 60 + eM);
              } else {
                end = addMinutes(start, session.duration || 60);
              }
            } else {
              end = addMinutes(start, session.duration || 60);
            }

            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              schedule.push({ start, end, type: 'bootcamp', title: `Bootcamp: ${bc.name}`, relatedId: bc.id, status: 'pending' });
            }
          });
        } catch (e) {
          console.error('Error parsing bootcamp time:', e);
        }
      });
    }

    // 2. Fill Flexible Tasks
    const flexibleTasks: { 
      title: string, 
      duration: number, 
      type: string, 
      relatedId: number, 
      preferredDate?: string, 
      status?: string, 
      priority?: string,
      relatedType?: string,
      relatedEntityId?: number,
      startMonth?: string,
      endMonth?: string,
      workingDays?: string,
      deadline?: string
    }[] = [];
    
    const maxDuration = profile.concentrationDuration || 60;

    // Project tasks are now scheduled via todos for better synchronization
    /*
    const projects = db.prepare("SELECT * FROM projects WHERE userId = ? AND status = 'pending'").all(userId) as any[];
    ...
    */

    // Internship tasks (only if they don't have subtasks, as subtasks are scheduled via todos)
    const internTasks = db.prepare(`
      SELECT it.*, i.startMonth, i.endMonth, i.workingDays 
      FROM internship_tasks it 
      JOIN internships i ON it.internshipId = i.id 
      WHERE i.userId = ? AND it.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM internship_subtasks WHERE taskId = it.id)
    `).all(userId) as any[];
    internTasks.forEach(t => {
      flexibleTasks.push({ 
        title: `Internship Task: ${t.title}`, 
        duration: Math.min(60, maxDuration), 
        type: 'internship_task', 
        relatedId: t.id,
        status: t.status || 'pending',
        startMonth: t.startMonth,
        endMonth: t.endMonth,
        workingDays: t.workingDays,
        deadline: t.deadline
      });
    });

    // Flexible Todos
    const flexTodos = db.prepare("SELECT * FROM todos WHERE userId = ? AND (fixedTime IS NULL OR fixedTime = '') AND status = 'pending'").all(userId) as any[];
    flexTodos.forEach(t => {
      if (t.type === 'chore') {
        flexibleTasks.push({ 
          title: `Chore: ${t.activity}`, 
          duration: t.duration || 60, 
          type: 'todo', 
          relatedId: t.id, 
          preferredDate: t.date,
          status: t.status || 'pending',
          priority: t.priority || 'none',
          relatedType: t.relatedType,
          relatedEntityId: t.relatedId,
          deadline: t.deadline
        });
      } else {
        let remaining = t.duration || 60;
        let part = 1;
        const totalParts = Math.ceil(remaining / maxDuration);

        while (remaining > 0) {
          const duration = Math.min(remaining, maxDuration);
          flexibleTasks.push({ 
            title: `Todo: ${t.activity}${totalParts > 1 ? ` (Part ${part})` : ''}`, 
            duration, 
            type: 'todo', 
            relatedId: t.id, 
            preferredDate: t.date,
            status: t.status || 'pending',
            priority: t.priority || 'none',
            relatedType: t.relatedType,
            relatedEntityId: t.relatedId,
            deadline: t.deadline
          });
          remaining -= duration;
          part++;
        }
      }
    });

    // Sort flexible tasks by priority and type
    const priorityMap: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1, 'none': 0, '': 0 };
    flexibleTasks.sort((a, b) => {
      // 1. Prioritize 'exam' (revision) over others
      const typeA = (a as any).relatedType || a.type;
      const typeB = (b as any).relatedType || b.type;
      
      if (typeA === 'exam' && typeB !== 'exam') return -1;
      if (typeA !== 'exam' && typeB === 'exam') return 1;

      // 2. Then by priority (high, medium, low)
      const pA = priorityMap[(a as any).priority || ''] || 0;
      const pB = priorityMap[(b as any).priority || ''] || 0;
      if (pB !== pA) return pB - pA;

      // 3. Then by preferred date (older first)
      if (a.preferredDate && b.preferredDate) {
        return a.preferredDate.localeCompare(b.preferredDate);
      }
      if (a.preferredDate) return -1;
      if (b.preferredDate) return 1;

      return 0;
    });

    // Find the earliest revision task date to define the start of the revision phase
    const earliestRevisionTask = db.prepare("SELECT MIN(date) as minDate FROM todos WHERE userId = ? AND relatedType = 'exam' AND status = 'pending'").get(userId) as any;
    const revisionStartDate = earliestRevisionTask?.minDate ? parseISO(earliestRevisionTask.minDate) : null;
    
    // 3. Placing Flexible Tasks in Free Slots
    for (let i = 0; i < days; i++) {
      const currentDay = addDays(startDate, i);
      const currentDayStr = format(currentDay, 'yyyy-MM-dd');
      const dayOfWeek = format(currentDay, 'EEEE');
      const isRestDay = dayOfWeek === user.restDay;
      
      if (isRestDay) continue;

      let currentTime = addMinutes(startOfDay(currentDay), profile.preferredStudyHours[0] * 60);
      const endTimeLimit = addMinutes(startOfDay(currentDay), profile.preferredStudyHours[1] * 60);

      // Time-aware: If scheduling for today, start from current time if it's later than preferred start
      if (isSameDay(currentDay, new Date())) {
        const now = new Date();
        if (isAfter(now, currentTime)) {
          // Round to next 15-minute interval for cleaner scheduling
          const minutes = now.getMinutes();
          const roundedMinutes = Math.ceil(minutes / 15) * 15;
          currentTime = addMinutes(startOfDay(now), now.getHours() * 60 + roundedMinutes);
        }
      }

      // Buffer based on workload tolerance
      const bufferMinutes = profile.workloadTolerance === 'low' ? 30 : profile.workloadTolerance === 'medium' ? 15 : 5;

      // Try to place tasks that have a preferred date first
      const tasksToTry = [...flexibleTasks];
      let taskIndex = 0;

      while (currentTime < endTimeLimit && tasksToTry.length > 0 && taskIndex < tasksToTry.length) {
        const task = tasksToTry[taskIndex];
        
        // Check period constraints for flexible tasks
        if (task.type === 'internship_task' || (task as any).relatedType === 'internship_subtask') {
          if ((task as any).relatedType !== 'internship_subtask') {
            if (!this.isWithinMonthRange(currentDay, (task as any).startMonth, (task as any).endMonth)) {
              taskIndex++;
              continue;
            }
            // Check if it's a working day
            if ((task as any).workingDays) {
              try {
                const workingDays = typeof (task as any).workingDays === 'string' ? JSON.parse((task as any).workingDays) : (task as any).workingDays;
                if (!workingDays.includes(dayOfWeek)) {
                  taskIndex++;
                  continue;
                }
              } catch (e) {}
            }
          }
        }
        
        if (task.type === 'study_plan' || (task as any).relatedType === 'study_plan') {
          // 1. Semester Boundary Constraint (Fallback)
          if (!this.isWithinMonthRange(currentDay, user.semesterStartMonth, user.semesterEndMonth)) {
            taskIndex++;
            continue;
          }

          // 2. Determine Teaching Period End
          let teachingEndLimit: Date | null = null;
          if (user.examStartDate) {
            const examStart = parseISO(user.examStartDate);
            if (!isNaN(examStart.getTime())) {
              teachingEndLimit = examStart;
            }
          }

          // 3. Apply Hierarchy of Constraints
          if (teachingEndLimit) {
            // If Exam Period is defined, Study Plan must NOT extend beyond the start of exams (Teaching Period)
            if (isAfter(currentDay, teachingEndLimit)) {
              taskIndex++;
              continue;
            }
          } else if (user.semesterEndMonth) {
            // Fallback: If Exam Period is NOT defined, ensure it doesn't exceed Semester Period
            // (Already handled by isWithinMonthRange, but we can be explicit if needed)
          }

          // 4. Revision/Exam Phase: Prioritize Revision Plan over Study Plan
          // If a Revision Plan has been generated, it takes precedence.
          const hasRevisionTasksToday = flexibleTasks.some(t => 
            (t as any).relatedType === 'exam' && t.preferredDate === currentDayStr
          );

          if (hasRevisionTasksToday) {
            taskIndex++;
            continue;
          }
        }

        // If task has a preferred date and it's in the future, skip for now
        if (task.preferredDate && isAfter(parseISO(task.preferredDate), currentDay)) {
          taskIndex++;
          continue;
        }

        const taskEnd = addMinutes(currentTime, task.duration);

        // Check if taskEnd exceeds its deadline
        if (task.deadline) {
          const deadlineDate = parseISO(task.deadline);
          if (isAfter(taskEnd, deadlineDate)) {
            taskIndex++;
            continue;
          }
        }

        const conflict = schedule.find(s => 
          (currentTime >= s.start && currentTime < s.end) || 
          (taskEnd > s.start && taskEnd <= s.end) ||
          (currentTime <= s.start && taskEnd >= s.end)
        );

        if (!conflict && taskEnd <= endTimeLimit) {
          let taskType = task.type;
          if ((task as any).relatedType === 'study_plan') {
            taskType = 'study_plan';
          } else if ((task as any).relatedType === 'exam') {
            taskType = 'exam';
          } else if ((task as any).relatedType === 'internship_task') {
            taskType = 'internship_task';
          } else if ((task as any).relatedType === 'internship_subtask') {
            taskType = 'internship_subtask';
          } else if ((task as any).relatedType === 'project_task') {
            taskType = 'project';
          }

          schedule.push({ 
            start: currentTime, 
            end: taskEnd, 
            type: taskType, 
            title: task.title, 
            relatedId: task.relatedId,
            status: task.status || 'pending'
          });
          // Remove from original flexibleTasks
          const originalIndex = flexibleTasks.findIndex(t => t.relatedId === task.relatedId && t.type === task.type && t.title === task.title);
          if (originalIndex > -1) flexibleTasks.splice(originalIndex, 1);
          tasksToTry.splice(taskIndex, 1);
          currentTime = addMinutes(taskEnd, bufferMinutes); // Add buffer after task
          taskIndex = 0; // Reset to try other tasks in the new free slot
        } else if (conflict) {
          // Move to next possible start time
          currentTime = conflict.end;
          taskIndex = 0; // Reset to try tasks from the beginning at the new time
        } else {
          // taskEnd > endTimeLimit, try next task
          taskIndex++;
          
          // If we've tried all tasks at this currentTime and none fit, move currentTime forward
          if (taskIndex >= tasksToTry.length) {
            currentTime = addMinutes(currentTime, 15);
            taskIndex = 0;
          }
        }
      }
    }

    return schedule.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  static async saveSchedule(userId: number, schedule: TimeSlot[], startDateStr: string, days: number, clearAll: boolean = false) {
    const startDate = parseISO(startDateStr);
    const endDate = addDays(startDate, days);
    const startDateFormatted = format(startDate, "yyyy-MM-dd'T'00:00:00");
    const endDateFormatted = format(endDate, "yyyy-MM-dd'T'23:59:59");
    
    if (clearAll) {
      // Delete ALL schedule items for the user
      db.prepare('DELETE FROM schedule_items WHERE userId = ?').run(userId);
    } else {
      // 1. Delete all items in the range being generated
      db.prepare('DELETE FROM schedule_items WHERE userId = ? AND startTime >= ? AND startTime <= ?').run(userId, startDateFormatted, endDateFormatted);
      
      // 2. Delete all pending flexible tasks that are after the range (to avoid duplicates when they are re-placed)
      db.prepare(`
        DELETE FROM schedule_items 
        WHERE userId = ? 
        AND status = 'pending' 
        AND type IN ('study', 'study_plan', 'project', 'todo', 'internship_task', 'internship_subtask')
        AND startTime > ?
      `).run(userId, endDateFormatted);
    }
    
    const insert = db.prepare(`
      INSERT INTO schedule_items (userId, title, type, startTime, endTime, relatedId, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        if (isNaN(item.start.getTime()) || isNaN(item.end.getTime())) {
          console.warn('Skipping invalid schedule item:', item.title);
          continue;
        }
        insert.run(userId, item.title, item.type, format(item.start, "yyyy-MM-dd'T'HH:mm:ss"), format(item.end, "yyyy-MM-dd'T'HH:mm:ss"), item.relatedId, item.status || 'pending');
      }
    });

    transaction(schedule);
  }
}
