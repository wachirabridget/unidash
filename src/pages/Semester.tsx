import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Book, Calendar, Clock, Trash2, Loader2, ArrowLeft, Edit2, RotateCcw, X, Sparkles, GraduationCap, Check, AlertCircle, RefreshCw, CheckCircle2, BookOpen } from 'lucide-react';
import { aiService } from '../services/aiService';
import { useAuth } from '../context/AuthContext';
import { format, parseISO, addDays, startOfMonth, endOfMonth, isValid, isAfter, isWithinInterval, differenceInWeeks, differenceInDays } from 'date-fns';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const Semester = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [units, setUnits] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingRevision, setGeneratingRevision] = useState<number | null>(null);
  const [generatingStudyPlan, setGeneratingStudyPlan] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [showExamForm, setShowExamForm] = useState(false);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [isEditingExam, setIsEditingExam] = useState(false);
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [unitForm, setUnitForm] = useState({
    unitName: '',
    sessions: [{ day: 'Monday', startTime: '08:00', durationHours: 2, durationMinutes: 0 }]
  });
  const [profileForm, setProfileForm] = useState({
    yearOfStudy: user?.yearOfStudy || 1,
    semesterType: user?.semesterType || 'Semester 1',
    semesterStartMonth: user?.semesterStartMonth || 'January',
    semesterEndMonth: user?.semesterEndMonth || 'April'
  });

  const [examPeriod, setExamPeriod] = useState({
    startDate: user?.examStartDate || '',
    endDate: user?.examEndDate || ''
  });

  useEffect(() => {
    if (user) {
      setProfileForm({
        yearOfStudy: user.yearOfStudy || 1,
        semesterType: user.semesterType || 'Semester 1',
        semesterStartMonth: user.semesterStartMonth || 'January',
        semesterEndMonth: user.semesterEndMonth || 'April'
      });
      setExamPeriod({
        startDate: user.examStartDate || '',
        endDate: user.examEndDate || ''
      });
    }
  }, [user]);

  const [isUpdatingExamPeriod, setIsUpdatingExamPeriod] = useState(false);
  const [showExamPeriodModal, setShowExamPeriodModal] = useState(false);
  const [showExamPeriodDeleteModal, setShowExamPeriodDeleteModal] = useState(false);
  const [showProfileResetModal, setShowProfileResetModal] = useState(false);
  const [duplicatePlanModal, setDuplicatePlanModal] = useState<{
    type: 'study' | 'revision';
    exam?: any;
  } | null>(null);

  const isWithinSemester = (dateStr: string) => {
    if (!user?.semesterStartMonth || !user?.semesterEndMonth || !dateStr) return true;
    
    const date = parseISO(dateStr);
    const month = format(date, 'MMMM');
    const monthIndex = months.indexOf(month);
    const startIdx = months.indexOf(user.semesterStartMonth);
    const endIdx = months.indexOf(user.semesterEndMonth);
    
    if (startIdx <= endIdx) {
      return monthIndex >= startIdx && monthIndex <= endIdx;
    } else {
      // Spans across new year (e.g., Sept to Jan)
      return monthIndex >= startIdx || monthIndex <= endIdx;
    }
  };

  const handleUpdateExamPeriod = async () => {
    if (!examPeriod.startDate || !examPeriod.endDate) {
      alert('Please select both start and end dates.');
      return;
    }

    const start = parseISO(examPeriod.startDate);
    const end = parseISO(examPeriod.endDate);

    if (start > end) {
      alert('Start date cannot be after end date.');
      return;
    }

    if (!isWithinSemester(examPeriod.startDate) || !isWithinSemester(examPeriod.endDate)) {
      alert(`Exam period must be within your semester months (${user.semesterStartMonth} to ${user.semesterEndMonth}).`);
      return;
    }

    setIsUpdatingExamPeriod(true);
    try {
      await api.auth.updateProfile({
        examStartDate: examPeriod.startDate,
        examEndDate: examPeriod.endDate
      });
      await api.schedule.generate({ clearAll: true });
      await refreshUser();
      setShowExamPeriodModal(false);
      alert('Exam period updated successfully! Your schedule has been updated.');
    } catch (err) {
      console.error(err);
      alert('Failed to update exam period.');
    } finally {
      setIsUpdatingExamPeriod(false);
    }
  };

  const handleDeleteExamPeriod = async () => {
    setIsUpdatingExamPeriod(true);
    try {
      await api.auth.updateProfile({
        examStartDate: null,
        examEndDate: null
      });
      await api.schedule.generate({ clearAll: true });
      await refreshUser();
      setExamPeriod({ startDate: '', endDate: '' });
      setShowExamPeriodDeleteModal(false);
      alert('Exam period deleted successfully! Your schedule has been reset.');
    } catch (err) {
      console.error(err);
      alert('Failed to delete exam period.');
    } finally {
      setIsUpdatingExamPeriod(false);
    }
  };

  const hasChanged = 
    profileForm.yearOfStudy !== user?.yearOfStudy ||
    profileForm.semesterType !== user?.semesterType ||
    profileForm.semesterStartMonth !== user?.semesterStartMonth ||
    profileForm.semesterEndMonth !== user?.semesterEndMonth;

  const handleUpdateProfile = async () => {
    const shouldReset = isProfileSet && hasChanged;

    setIsUpdatingProfile(true);
    try {
      await api.auth.updateProfile({
        ...profileForm,
        resetAcademicData: shouldReset
      });
      
      await refreshUser();
      await fetchData(); // Refresh units and exams list
      setShowProfileResetModal(false);
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      if (shouldReset) {
        alert('Academic progress updated! All previous data has been cleared and your new semester is ready.');
      } else {
        alert('Academic progress updated successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update academic progress.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateClick = () => {
    const hasChanged = 
      profileForm.yearOfStudy !== user?.yearOfStudy ||
      profileForm.semesterType !== user?.semesterType ||
      profileForm.semesterStartMonth !== user?.semesterStartMonth ||
      profileForm.semesterEndMonth !== user?.semesterEndMonth;

    if (isProfileSet && hasChanged) {
      setShowProfileResetModal(true);
    } else {
      handleUpdateProfile();
    }
  };

  const [unitToDelete, setUnitToDelete] = useState<any>(null);
  const [examToDelete, setExamToDelete] = useState<any>(null);
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [examForm, setExamForm] = useState({
    unitId: '',
    type: 'CAT',
    dateTime: ''
  });
  const [examError, setExamError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [u, e, t] = await Promise.all([
        api.units.getAll(), 
        api.units.getExams(),
        api.todos.getAll()
      ]);
      setUnits(Array.isArray(u) ? u : []);
      setExams(Array.isArray(e) ? e : []);
      setTodos(Array.isArray(t) ? t : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmitUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate sessions
    if (unitForm.sessions.length === 0) {
      alert('Please add at least one class session.');
      return;
    }

    const payload = {
      unitName: unitForm.unitName,
      sessions: unitForm.sessions.map(s => ({
        day: s.day,
        startTime: s.startTime,
        duration: (s.durationHours * 60) + s.durationMinutes
      })),
      // Legacy fields for backward compatibility
      classDays: unitForm.sessions.map(s => s.day),
      classTime: unitForm.sessions[0].startTime,
      duration: (unitForm.sessions[0].durationHours * 60) + unitForm.sessions[0].durationMinutes
    };

    if (isEditingUnit && editingUnitId) {
      await api.units.update(editingUnitId, payload);
    } else {
      await api.units.create(payload);
    }
    setShowUnitForm(false);
    setIsEditingUnit(false);
    setEditingUnitId(null);
    setUnitForm({ 
      unitName: '', 
      sessions: [{ day: 'Monday', startTime: '08:00', durationHours: 2, durationMinutes: 0 }] 
    });
    fetchData();
  };

  const getExamConstraints = () => {
    if (!user?.semesterStartMonth || !user?.semesterEndMonth) return {};
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const startMonthIdx = months.indexOf(user.semesterStartMonth);
    const endMonthIdx = months.indexOf(user.semesterEndMonth);
    
    let startDate = new Date(currentYear, startMonthIdx, 1);
    let endDate = new Date(currentYear, endMonthIdx, 1);
    endDate = endOfMonth(endDate);
    
    if (startMonthIdx > endMonthIdx) {
      // Spans across new year (e.g., Sept to Jan)
      const currentMonthIdx = now.getMonth();
      if (currentMonthIdx >= startMonthIdx) {
        // We are in the starting part of the semester (late in the year)
        endDate.setFullYear(currentYear + 1);
      } else if (currentMonthIdx <= endMonthIdx) {
        // We are in the ending part of the semester (early in the year)
        startDate.setFullYear(currentYear - 1);
      } else {
        // We are in the "gap" months. Default to the upcoming semester occurrence.
        // If we are closer to the start month, assume it starts this year.
        endDate.setFullYear(currentYear + 1);
      }
    } else {
      // Does not span across new year (e.g., Jan to June)
      const currentMonthIdx = now.getMonth();
      if (currentMonthIdx > endMonthIdx) {
        // Current year's semester has passed, assume next year
        startDate.setFullYear(currentYear + 1);
        endDate.setFullYear(currentYear + 1);
      }
      // If currentMonthIdx < startMonthIdx, we are before this year's semester, which is fine.
    }

    if (examForm.type === 'EXAM') {
      if (user?.examStartDate && user?.examEndDate) {
        return {
          min: `${user.examStartDate}T00:00`,
          max: `${user.examEndDate}T23:59`
        };
      }
      return {
        min: format(startDate, "yyyy-MM-dd'T'00:00"),
        max: format(endDate, "yyyy-MM-dd'T'23:59")
      };
    } else {
      // CATs
      let maxDate = endDate;
      if (user?.examStartDate) {
        const examStart = parseISO(user.examStartDate);
        maxDate = addDays(examStart, -1);
      }
      return {
        min: format(startDate, "yyyy-MM-dd'T'00:00"),
        max: format(maxDate, "yyyy-MM-dd'T'23:59")
      };
    }
  };

  const constraints = getExamConstraints();

  useEffect(() => {
    if (examForm.dateTime) {
      const dt = examForm.dateTime;
      if (constraints.min && dt < constraints.min) {
        setExamForm(prev => ({ ...prev, dateTime: '' }));
      } else if (constraints.max && dt > constraints.max) {
        setExamForm(prev => ({ ...prev, dateTime: '' }));
      }
    }
  }, [examForm.type, constraints.min, constraints.max]);

  const handleSubmitExam = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!examForm.dateTime) {
      alert('Please select a date and time.');
      return;
    }

    if (examForm.type === 'EXAM' && (!user?.examStartDate || !user?.examEndDate)) {
      alert('Please set your Semester Exam Period first before adding a final EXAM.');
      return;
    }

    if (new Date(examForm.dateTime) < new Date()) {
      alert(`Cannot schedule a ${examForm.type} in the past.`);
      return;
    }

    if (constraints.min && examForm.dateTime < constraints.min) {
      alert(`The selected date is before the allowed period (starts ${format(parseISO(constraints.min), 'MMM do, yyyy')}).`);
      return;
    }

    if (constraints.max && examForm.dateTime > constraints.max) {
      alert(`The selected date is after the allowed period (ends ${format(parseISO(constraints.max), 'MMM do, yyyy')}).`);
      return;
    }

    // Validation: Only one EXAM allowed per unit. Multiple CATs are allowed.
    if (examForm.type === 'EXAM') {
      const existingExam = exams.find(e => e.unitId === Number(examForm.unitId) && e.type === 'EXAM');
      if (existingExam && (!isEditingExam || editingExamId !== existingExam.id)) {
        setExamError(`This unit already has a scheduled exam.`);
        return;
      }
    }

    // Optional: Prevent exact duplicate CATs (same unit, same time)
    if (examForm.type === 'CAT') {
      const duplicateCat = exams.find(e => e.unitId === Number(examForm.unitId) && e.type === 'CAT' && e.dateTime === examForm.dateTime);
      if (duplicateCat && (!isEditingExam || editingExamId !== duplicateCat.id)) {
        setExamError(`A CAT for this unit is already scheduled at this exact time.`);
        return;
      }
    }

    try {
      if (isEditingExam && editingExamId) {
        await api.units.updateExam(editingExamId, examForm);
      } else {
        await api.units.createExam(examForm);
      }
      setShowExamForm(false);
      setIsEditingExam(false);
      setEditingExamId(null);
      setExamForm({ unitId: '', type: 'CAT', dateTime: '' });
      setExamError(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      if (err.error) {
        setExamError(err.error);
      } else {
        setExamError('Failed to save exam/CAT. Please try again.');
      }
    }
  };

  const openEditUnitModal = (unit: any) => {
    let sessions = [];
    if (unit.sessions) {
      try {
        const parsed = typeof unit.sessions === 'string' ? JSON.parse(unit.sessions) : unit.sessions;
        sessions = parsed.map((s: any) => ({
          day: s.day,
          startTime: s.startTime,
          durationHours: Math.floor(s.duration / 60),
          durationMinutes: s.duration % 60
        }));
      } catch (e) {
        console.error('Error parsing sessions:', e);
      }
    }
    
    if (sessions.length === 0) {
      // Fallback to legacy fields
      sessions = (typeof unit.classDays === 'string' ? JSON.parse(unit.classDays) : unit.classDays).map((day: string) => ({
        day,
        startTime: unit.classTime,
        durationHours: Math.floor(unit.duration / 60),
        durationMinutes: unit.duration % 60
      }));
    }

    setUnitForm({
      unitName: unit.unitName,
      sessions
    });
    setEditingUnitId(unit.id);
    setIsEditingUnit(true);
    setShowUnitForm(true);
  };

  const openEditExamModal = (exam: any) => {
    setExamForm({
      unitId: exam.unitId.toString(),
      type: exam.type,
      dateTime: new Date(exam.dateTime).toISOString().slice(0, 16)
    });
    setEditingExamId(exam.id);
    setIsEditingExam(true);
    setShowExamForm(true);
  };

  const handleDeleteUnit = (unit: any) => {
    setUnitToDelete(unit);
  };

  const confirmDeleteUnit = async () => {
    if (!unitToDelete) return;
    const unit = { ...unitToDelete };
    const associatedExams = exams.filter(e => e.unitId === unit.id);
    
    await api.units.delete(unit.id);
    setUnitToDelete(null);
    
    showUndo('Unit deleted', async () => {
      const { id: newUnitId } = await api.units.create({
        unitName: unit.unitName,
        classDays: typeof unit.classDays === 'string' ? JSON.parse(unit.classDays) : unit.classDays,
        classTime: unit.classTime,
        duration: unit.duration
      });
      
      // Restore associated exams
      for (const exam of associatedExams) {
        await api.units.createExam({
          unitId: newUnitId,
          type: exam.type,
          dateTime: exam.dateTime
        });
      }
      fetchData();
    });

    fetchData();
  };

  const handleDeleteExam = (exam: any) => {
    setExamToDelete(exam);
  };

  const confirmDeleteExam = async () => {
    if (!examToDelete) return;
    const exam = { ...examToDelete };
    await api.units.deleteExam(exam.id);
    setExamToDelete(null);
    
    showUndo('Exam/CAT deleted', async () => {
      await api.units.createExam({
        unitId: exam.unitId,
        type: exam.type,
        dateTime: exam.dateTime
      });
      fetchData();
    });

    fetchData();
  };

  const showUndo = (message: string, undo: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction({ message, undo });
    undoTimerRef.current = setTimeout(() => {
      setUndoAction(null);
    }, 5000);
  };

  const handleUndo = async () => {
    if (undoAction) {
      await undoAction.undo();
      setUndoAction(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    }
  };

  const handleGenerateRevisionPlan = async (exam: any, bypassCheck = false) => {
    if (!user?.concentrationProfile) {
      alert('Please complete your personality test in the profile settings first.');
      return;
    }

    const now = new Date();
    const examDate = parseISO(exam.dateTime);
    
    if (isAfter(now, examDate)) {
      alert('This assessment has already passed.');
      return;
    }

    const remainingDays = Math.max(1, differenceInDays(examDate, now));
    
    // A standard revision plan is 4 weeks (28 days). 
    // If less than 21 days left, it's time-constrained.
    const isTimeConstrained = remainingDays < 21;

    // Check if revision plan already exists for this exam
    if (!bypassCheck) {
      const existingRevisionPlan = todos.some(t => t.relatedType === 'exam' && t.relatedId === exam.id);
      if (existingRevisionPlan) {
        setDuplicatePlanModal({ type: 'revision', exam });
        return;
      }
    }

    setGeneratingRevision(exam.id);
    try {
      // Clear existing revision tasks for this exam if we are regenerating
      if (bypassCheck) {
        await api.todos.deleteRelated('exam', exam.id);
      }

      const profile = typeof user.concentrationProfile === 'string' ? JSON.parse(user.concentrationProfile) : user.concentrationProfile;
      const plan = await aiService.generateRevisionPlan(
        exam.unitName,
        exam.type,
        exam.dateTime,
        profile,
        remainingDays,
        isTimeConstrained
      );

      // Save tasks as todos
      for (const task of plan) {
        await api.todos.create({
          activity: `Revision: ${task.activity} (${exam.unitName})`,
          date: task.date,
          priority: task.priority,
          duration: task.duration,
          relatedType: 'exam',
          relatedId: exam.id
        });
      }

      const message = isTimeConstrained 
        ? `Successfully generated an intensive revision plan for the remaining ${remainingDays} days!`
        : `Successfully generated a comprehensive 4-week revision plan!`;
        
      alert(`${message} Check your dashboard and todos.`);
      
      // Sync schedule
      await api.schedule.generate({});
    } catch (err) {
      console.error(err);
      alert('Failed to generate revision plan. Please try again.');
    } finally {
      setGeneratingRevision(null);
    }
  };

  const handleGenerateStudyPlan = async (bypassCheck = false) => {
    if (!user?.concentrationProfile) {
      alert('Please complete your personality test in the profile settings first.');
      return;
    }
    if (units.length === 0) {
      alert('Add some units first before generating a study plan.');
      return;
    }

    const now = new Date();
    
    // Calculate semester end date
    let semesterEndDate: Date;
    if (user.examEndDate) {
      semesterEndDate = parseISO(user.examEndDate);
    } else {
      // Fallback to end of semester month
      const monthIdx = months.indexOf(user.semesterEndMonth || 'December');
      semesterEndDate = endOfMonth(new Date(now.getFullYear(), monthIdx));
      // If end month is earlier in the year than start month, it might be next year
      const startIdx = months.indexOf(user.semesterStartMonth || 'January');
      if (monthIdx < startIdx && now.getMonth() >= startIdx) {
        semesterEndDate = endOfMonth(new Date(now.getFullYear() + 1, monthIdx));
      }
    }

    if (isAfter(now, semesterEndDate)) {
      alert('The current semester has already ended. You cannot generate a study plan for a past period.');
      return;
    }

    const remainingWeeks = Math.max(1, differenceInWeeks(semesterEndDate, now));
    
    // Determine if it's mid-semester
    // A typical semester is 12-16 weeks. If less than 8 weeks left, it's mid-semester.
    const isMidSemester = remainingWeeks < 8;

    // Check if study plan already exists
    if (!bypassCheck) {
      const existingStudyPlan = todos.some(t => t.relatedType === 'study_plan');
      if (existingStudyPlan) {
        setDuplicatePlanModal({ type: 'study' });
        return;
      }
    }

    setGeneratingStudyPlan(true);
    try {
      // Clear existing study plan if we are regenerating
      if (bypassCheck) {
        await api.todos.deleteRelated('study_plan', 'all');
      }

      const profile = typeof user.concentrationProfile === 'string' ? JSON.parse(user.concentrationProfile) : user.concentrationProfile;
      const plan = await aiService.generateStudyPlan(units, profile, remainingWeeks, isMidSemester);
      await api.units.generateStudyPlan(plan);
      
      const message = isMidSemester 
        ? `Successfully generated an accelerated study plan for the remaining ${remainingWeeks} weeks!`
        : `Successfully generated a personalized semester study plan with ${plan.length} topics!`;
        
      alert(`${message} Check your dashboard.`);
      await api.schedule.generate({});
    } catch (err) {
      console.error(err);
      alert('Failed to generate study plan. Please try again.');
    } finally {
      setGeneratingStudyPlan(false);
    }
  };

  const handleRegeneratePlan = async () => {
    if (!duplicatePlanModal) return;
    
    const { type, exam } = duplicatePlanModal;
    setDuplicatePlanModal(null);
    
    try {
      if (type === 'study') {
        await api.todos.deleteRelated('study_plan', 'all');
        // Refresh todos to reflect deletion
        const t = await api.todos.getAll();
        setTodos(t);
        await handleGenerateStudyPlan(true);
      } else if (type === 'revision' && exam) {
        await api.todos.deleteRelated('exam', exam.id);
        // Refresh todos to reflect deletion
        const t = await api.todos.getAll();
        setTodos(t);
        await handleGenerateRevisionPlan(exam, true);
      }
    } catch (err) {
      console.error('Regeneration error:', err);
      alert('Failed to regenerate plan. Please try again.');
    }
  };

  const isProfileSet = !!(user?.semesterStartMonth && user?.semesterEndMonth);

  const handleAddUnitClick = () => {
    if (!isProfileSet) {
      alert('Please update and save your Academic Progress first before adding units.');
      return;
    }
    setIsEditingUnit(false);
    setUnitForm({ 
      unitName: '', 
      sessions: [{ day: 'Monday', startTime: '08:00', durationHours: 2, durationMinutes: 0 }] 
    });
    setShowUnitForm(true);
  };

  const handleAddExamClick = () => {
    if (!isProfileSet) {
      alert('Please update and save your Academic Progress first before adding exams.');
      return;
    }
    if (units.length === 0) {
      alert('Please add at least one unit before adding exams.');
      return;
    }
    setIsEditingExam(false);
    setExamForm({ unitId: '', type: 'CAT', dateTime: '' });
    setShowExamForm(true);
  };

  const getAcademicPhase = () => {
    const now = new Date();
    
    // 1. Post-Exam Phase
    if (user?.examEndDate) {
      const examEnd = parseISO(user.examEndDate);
      if (!isNaN(examEnd.getTime()) && isAfter(now, examEnd)) {
        return { 
          name: 'Post-Exam Phase', 
          description: 'Semester complete. No active study plans.',
          color: 'text-slate-500 bg-slate-50 border-slate-100',
          icon: <CheckCircle2 size={14} />
        };
      }
    }

    // 2. Revision/Exam Phase
    let isExamPeriod = false;
    if (user?.examStartDate && user?.examEndDate) {
      const examStart = parseISO(user.examStartDate);
      const examEnd = parseISO(user.examEndDate);
      if (!isNaN(examStart.getTime()) && !isNaN(examEnd.getTime())) {
        isExamPeriod = isWithinInterval(now, { start: examStart, end: examEnd });
      }
    }

    const hasRevisionPlan = todos.some(t => t.relatedType === 'exam' && t.status === 'pending');
    const isRevisionPeriod = exams.some(exam => {
      const examDate = parseISO(exam.dateTime);
      if (isNaN(examDate.getTime()) || exam.type !== 'EXAM') return false;
      const revisionStart = addDays(examDate, -28);
      return isWithinInterval(now, { start: revisionStart, end: examDate });
    });

    if (isExamPeriod || hasRevisionPlan || isRevisionPeriod) {
      return { 
        name: 'Revision Phase', 
        description: 'Prioritizing Revision Plan for upcoming exams.',
        color: 'text-rose-600 bg-rose-50 border-rose-100',
        icon: <Calendar size={14} />
      };
    }

    // 3. Teaching Phase
    const isExamPeriodSet = user?.examStartDate && user?.examEndDate;
    return { 
      name: 'Teaching Phase', 
      description: 'Active learning. Study Plan is currently active.',
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      icon: <BookOpen size={14} />,
      warning: !isExamPeriodSet ? 'Exam period not set — limiting study plan to semester period' : null
    };
  };

  const phase = getAcademicPhase();

  return (
    <div className="space-y-8">
      <button 
        onClick={() => navigate('/')}
        className="group flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition-colors"
      >
        <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-all">
          <ArrowLeft size={20} />
        </div>
        <span className="font-bold text-sm tracking-tight">Back to Dashboard</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Academic Semester</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button 
            onClick={() => handleGenerateStudyPlan()}
            disabled={generatingStudyPlan || units.length === 0 || !isProfileSet}
            className="flex-1 sm:flex-none bg-white border border-indigo-100 text-indigo-600 px-3 sm:px-4 py-2 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-indigo-50 transition-all disabled:opacity-50 text-xs sm:text-sm"
          >
            {generatingStudyPlan ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            <span>AI Study Plan</span>
          </button>
          <button 
            onClick={handleAddUnitClick}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all text-xs sm:text-sm ${
              !isProfileSet 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Plus size={18} />
            <span>Unit</span>
          </button>
          <button 
            onClick={handleAddExamClick}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all text-xs sm:text-sm ${
              !isProfileSet 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Calendar size={18} />
            <span>Exam/CAT</span>
          </button>
        </div>
      </div>

      {/* Academic Progress Section */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-2.5 md:p-4 rounded-2xl border border-slate-100 shadow-sm mb-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 shrink-0 px-1">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <GraduationCap size={16} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900 leading-none">Academic Progress</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-full border text-[8px] font-bold uppercase tracking-wider ${phase.color}`}>
                  {phase.icon}
                  <span>{phase.name}</span>
                </div>
                {(phase as any).warning && (
                  <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full border border-amber-100 bg-amber-50 text-amber-600 text-[8px] font-bold uppercase tracking-wider">
                    <AlertCircle size={10} />
                    <span>{(phase as any).warning}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {[
              { label: 'Year', value: profileForm.yearOfStudy, key: 'yearOfStudy', options: [1, 2, 3, 4, 5, 6, 7].map(y => ({ label: `Year ${y}`, value: y })) },
              { label: 'Semester', value: profileForm.semesterType, key: 'semesterType', options: ['Semester 1', 'Semester 2', 'Trimester 1', 'Trimester 2', 'Trimester 3'].map(s => ({ label: s, value: s })) },
              { label: 'Start', value: profileForm.semesterStartMonth, key: 'semesterStartMonth', options: months.map(m => ({ label: m, value: m })) },
              { label: 'End', value: profileForm.semesterEndMonth, key: 'semesterEndMonth', options: months.map(m => ({ label: m, value: m })) }
            ].map((field) => (
              <div key={field.key} className="relative group">
                <label className="absolute -top-1.5 left-2 px-1 bg-white text-[7px] font-bold text-slate-400 uppercase tracking-widest z-10 opacity-0 group-focus-within:opacity-100 transition-opacity">
                  {field.label}
                </label>
                <select 
                  value={field.value}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, [field.key]: field.key === 'yearOfStudy' ? parseInt(e.target.value) : e.target.value }))}
                  className="bg-slate-50 border border-slate-100 text-slate-900 text-[10px] font-bold rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2 transition-all outline-none cursor-pointer hover:bg-slate-100 appearance-none"
                >
                  {field.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Clock size={10} />
                </div>
              </div>
            ))}
          </div>

          <div className="shrink-0 flex items-center">
            <button
              onClick={handleUpdateClick}
              disabled={isUpdatingProfile || (isProfileSet && !hasChanged)}
              className={`w-full lg:w-auto px-4 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-sm ${
                showSuccess 
                  ? 'bg-emerald-500 text-white shadow-emerald-100' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
              } disabled:opacity-50`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isUpdatingProfile ? 'loading' : showSuccess ? 'success' : 'idle'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center space-x-2"
                >
                  {isUpdatingProfile ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : showSuccess ? (
                    <Check size={12} />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  <span>
                    {isUpdatingProfile ? 'Updating...' : showSuccess ? 'Updated!' : isProfileSet ? 'Update' : 'Set Progress'}
                  </span>
                </motion.div>
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Units List */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Book className="text-indigo-600" size={24} />
            <span>Registered Units</span>
          </h2>
          
          <div className="space-y-4">
            {units.map((unit, i) => (
              <motion.div 
                key={unit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
              >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900">{unit.unitName}</h3>
                      <div className="space-y-2 mt-3">
                        {unit.sessions ? (
                          (typeof unit.sessions === 'string' ? JSON.parse(unit.sessions) : unit.sessions).map((session: any, idx: number) => (
                            <div key={idx} className="flex items-center space-x-3 text-xs text-slate-500">
                              <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider min-w-[40px] text-center">
                                {session.day.slice(0, 3)}
                              </span>
                              <div className="flex items-center space-x-1">
                                <Clock size={12} className="text-slate-400" />
                                <span>{session.startTime}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <RotateCcw size={12} className="text-slate-400" />
                                <span>{Math.floor(session.duration / 60)}h {session.duration % 60}m</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(typeof unit.classDays === 'string' ? JSON.parse(unit.classDays) : unit.classDays).map((day: string) => (
                              <span key={day} className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                                {day}
                              </span>
                            ))}
                            <div className="flex items-center space-x-3 text-xs text-slate-500 w-full mt-1">
                              <div className="flex items-center space-x-1">
                                <Clock size={12} className="text-slate-400" />
                                <span>{unit.classTime}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <RotateCcw size={12} className="text-slate-400" />
                                <span>{Math.floor(unit.duration / 60)}h {unit.duration % 60}m</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button 
                        onClick={() => openEditUnitModal(unit)}
                        title="Edit Unit"
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteUnit(unit)}
                        title="Delete Unit"
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Exams List */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
              <Calendar className="text-rose-600" size={24} />
              <span>Upcoming Exams & CATs</span>
            </h2>
            <button 
              onClick={() => setShowExamPeriodModal(true)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
            >
              <Clock size={14} />
              <span>Set Exam Period</span>
            </button>
          </div>

          {user?.examStartDate && user?.examEndDate && isValid(parseISO(user.examStartDate)) && isValid(parseISO(user.examEndDate)) && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white rounded-xl text-rose-600 shadow-sm">
                  <Calendar size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-rose-400 uppercase tracking-wider">Semester Exam Period</p>
                  <p className="text-sm font-bold text-rose-900">
                    {format(parseISO(user.examStartDate), 'MMM do')} - {format(parseISO(user.examEndDate), 'MMM do, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <p className="text-[10px] font-bold text-rose-500 bg-white/50 px-2 py-1 rounded-md uppercase tracking-widest hidden sm:block">
                  Classes Suspended
                </p>
                <div className="flex space-x-1">
                  <button 
                    onClick={() => {
                      setExamPeriod({
                        startDate: user.examStartDate || '',
                        endDate: user.examEndDate || ''
                      });
                      setShowExamPeriodModal(true);
                    }}
                    title="Edit Exam Period"
                    className="p-2 text-rose-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => setShowExamPeriodDeleteModal(true)}
                    title="Delete Exam Period"
                    className="p-2 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            {exams.map((exam, i) => (
              <motion.div 
                key={exam.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold shrink-0 ${exam.type === 'EXAM' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                      <span className="text-xs leading-none">{exam.type}</span>
                      <span className="text-[8px] uppercase tracking-tighter mt-0.5 opacity-70">
                        {exam.type === 'EXAM' ? 'Final' : 'CAT'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{exam.unitName}</h3>
                      <div className="flex items-center space-x-2 text-sm text-slate-500">
                        <Calendar size={12} className="text-slate-400" />
                        <span>{format(parseISO(exam.dateTime), 'MMM do, yyyy')}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full" />
                        <Clock size={12} className="text-slate-400" />
                        <span>{format(parseISO(exam.dateTime), 'h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => handleGenerateRevisionPlan(exam)}
                      disabled={generatingRevision === exam.id}
                      title="Generate AI Revision Plan"
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-50"
                    >
                      {generatingRevision === exam.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Sparkles size={18} />
                      )}
                    </button>
                    <button 
                      onClick={() => openEditExamModal(exam)}
                      title="Edit Exam/CAT"
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteExam(exam)}
                      title="Delete Exam/CAT"
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      {/* Unit Modal */}
      {showUnitForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl my-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{isEditingUnit ? 'Edit Unit' : 'Add New Unit'}</h2>
              <button 
                onClick={() => setShowUnitForm(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitUnit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Unit Name</label>
                <input 
                  type="text" 
                  required
                  value={unitForm.unitName}
                  onChange={(e) => setUnitForm({...unitForm, unitName: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  placeholder="e.g. Advanced Calculus"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-bold text-slate-700">Class Sessions</label>
                  <button 
                    type="button"
                    onClick={() => setUnitForm({
                      ...unitForm, 
                      sessions: [...unitForm.sessions, { day: 'Monday', startTime: '08:00', durationHours: 2, durationMinutes: 0 }]
                    })}
                    className="flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider"
                  >
                    <Plus size={14} />
                    <span>Add Session</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {unitForm.sessions.map((session, index) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={index} 
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group"
                    >
                      {unitForm.sessions.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => {
                            const newSessions = [...unitForm.sessions];
                            newSessions.splice(index, 1);
                            setUnitForm({...unitForm, sessions: newSessions});
                          }}
                          className="absolute -top-2 -right-2 p-1.5 bg-white text-rose-500 border border-rose-100 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-50"
                        >
                          <X size={12} />
                        </button>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Day</label>
                          <select 
                            value={session.day}
                            onChange={(e) => {
                              const newSessions = [...unitForm.sessions];
                              newSessions[index].day = e.target.value;
                              setUnitForm({...unitForm, sessions: newSessions});
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {days.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Start Time</label>
                          <input 
                            type="time" 
                            required
                            value={session.startTime}
                            onChange={(e) => {
                              const newSessions = [...unitForm.sessions];
                              newSessions[index].startTime = e.target.value;
                              setUnitForm({...unitForm, sessions: newSessions});
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hours</label>
                            <input 
                              type="number" 
                              min="0"
                              max="12"
                              required
                              value={session.durationHours}
                              onChange={(e) => {
                                const newSessions = [...unitForm.sessions];
                                newSessions[index].durationHours = parseInt(e.target.value) || 0;
                                setUnitForm({...unitForm, sessions: newSessions});
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mins</label>
                            <input 
                              type="number" 
                              min="0"
                              max="59"
                              required
                              value={session.durationMinutes}
                              onChange={(e) => {
                                const newSessions = [...unitForm.sessions];
                                newSessions[index].durationMinutes = parseInt(e.target.value) || 0;
                                setUnitForm({...unitForm, sessions: newSessions});
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowUnitForm(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm shadow-lg shadow-indigo-100"
                >
                  {isEditingUnit ? 'Save Changes' : 'Create Unit'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Exam Modal */}
      {showExamForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{isEditingExam ? 'Edit Assessment' : 'Add Assessment'}</h2>
            <p className="text-sm text-slate-500 mb-6">Schedule your CATs and Final Exams</p>

            {examError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start space-x-2 text-rose-600"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="text-xs font-bold leading-tight">{examError}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmitExam} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Unit</label>
                <select 
                  required
                  value={examForm.unitId}
                  onChange={(e) => setExamForm({...examForm, unitId: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select a unit</option>
                  {units.map(u => {
                    const unitExams = exams.filter(e => e.unitId === u.id);
                    const catCount = unitExams.filter(e => e.type === 'CAT').length;
                    const hasExam = unitExams.some(e => e.type === 'EXAM');
                    
                    // If we're editing, we need to know if the current exam being edited belongs to this unit
                    const isEditingThisUnit = isEditingExam && unitExams.some(e => e.id === editingExamId);
                    const currentEditingType = isEditingExam ? exams.find(e => e.id === editingExamId)?.type : null;

                    // Disable if adding an EXAM and one already exists
                    const isExamDisabled = examForm.type === 'EXAM' && hasExam && (!isEditingExam || currentEditingType !== 'EXAM');
                    
                    return (
                      <option 
                        key={u.id} 
                        value={u.id} 
                        disabled={isExamDisabled}
                        className={isExamDisabled ? 'text-slate-400' : ''}
                      >
                        {u.unitName} 
                        {catCount > 0 || hasExam ? ' (' : ''}
                        {catCount > 0 ? `${catCount} CAT${catCount > 1 ? 's' : ''}` : ''}
                        {catCount > 0 && hasExam ? ' & ' : ''}
                        {hasExam ? 'Exam Set' : ''}
                        {catCount > 0 || hasExam ? ')' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
                <div className="flex space-x-4">
                  {['CAT', 'EXAM'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setExamForm({...examForm, type: t})}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                        examForm.type === t 
                          ? 'bg-indigo-50 border-indigo-600 text-indigo-700' 
                          : 'bg-slate-50 border-transparent text-slate-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">Date & Time</label>
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    Smart Restricted
                  </span>
                </div>
                <input 
                  type="datetime-local" 
                  required
                  min={constraints.min}
                  max={constraints.max}
                  value={examForm.dateTime}
                  onChange={(e) => setExamForm({...examForm, dateTime: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
                
                <div className="mt-3 space-y-2">
                  {/* Status Badge */}
                  <div className={`flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all ${
                    examForm.type === 'CAT' 
                      ? 'text-indigo-600 bg-indigo-50 border-indigo-100' 
                      : (user?.examStartDate && user?.examEndDate ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-amber-600 bg-amber-50 border-amber-100')
                  }`}>
                    <AlertCircle size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {examForm.type === 'CAT' 
                        ? `Teaching Period: ${user?.semesterStartMonth} ${user?.examStartDate && isValid(parseISO(user.examStartDate)) ? `- ${format(addDays(parseISO(user.examStartDate), -1), 'MMM do')}` : `- ${user?.semesterEndMonth}`}`
                        : (user?.examStartDate && user?.examEndDate && isValid(parseISO(user.examStartDate)) && isValid(parseISO(user.examEndDate))
                            ? `Exam Window: ${format(parseISO(user.examStartDate), 'MMM do')} - ${format(parseISO(user.examEndDate), 'MMM do')}`
                            : 'Set Exam Period First')}
                    </span>
                  </div>

                  {/* Explicit Range Help */}
                  {constraints.min && constraints.max && isValid(parseISO(constraints.min)) && isValid(parseISO(constraints.max)) && (
                    <p className="text-[10px] text-slate-500 font-medium px-1 flex items-center space-x-1">
                      <Clock size={10} className="text-slate-400" />
                      <span>Allowed: {format(parseISO(constraints.min), 'MMM do, yyyy')} — {format(parseISO(constraints.max), 'MMM do, yyyy')}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowExamForm(false);
                    setExamError(null);
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Exam Period Modal */}
      {showExamPeriodModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Semester Exam Period</h2>
                <p className="text-sm text-slate-500">Classes will be suspended during this time</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Period Start Date</label>
                  <input 
                    type="date"
                    value={examPeriod.startDate}
                    onChange={(e) => setExamPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Period End Date</label>
                  <input 
                    type="date"
                    value={examPeriod.endDate}
                    onChange={(e) => setExamPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="mt-1 flex items-center space-x-2 text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100">
                  <AlertCircle size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Semester Months: {user?.semesterStartMonth} - {user?.semesterEndMonth}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="text-amber-600 mt-0.5" size={18} />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Setting this period will automatically remove all regular classes from your dashboard schedule between these dates.
                  </p>
                </div>
              </div>

              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowExamPeriodModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateExamPeriod}
                  disabled={isUpdatingExamPeriod}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isUpdatingExamPeriod ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                  <span>Save Period</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Undo Toast */}
      <AnimatePresence>
        {undoAction && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-6 border border-slate-800"
          >
            <span className="text-sm font-medium text-slate-300">{undoAction.message}</span>
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleUndo}
                className="flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 font-bold text-sm transition-colors"
              >
                <RotateCcw size={16} />
                <span>Undo</span>
              </button>
              <div className="w-px h-4 bg-slate-700" />
              <button 
                onClick={() => setUndoAction(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Reset Confirmation Modal */}
      {showProfileResetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-500">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">New Academic Period?</h2>
            <div className="text-slate-500 mb-6 text-sm leading-relaxed">
              You are updating your academic progress. To ensure <span className="font-bold text-indigo-600">academic isolation</span> and prevent carryover from your previous period, the following will be cleared:
              <ul className="text-left mt-3 space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <li className="flex items-center space-x-2 text-rose-600 font-medium">
                  <X size={14} /> <span>All Registered Units</span>
                </li>
                <li className="flex items-center space-x-2 text-rose-600 font-medium">
                  <X size={14} /> <span>All Exams and CATs</span>
                </li>
                <li className="flex items-center space-x-2 text-rose-600 font-medium">
                  <X size={14} /> <span>Previous Exam Period</span>
                </li>
                <li className="flex items-center space-x-2 text-rose-600 font-medium">
                  <X size={14} /> <span>Current Schedule & Study Plans</span>
                </li>
              </ul>
              <p className="mt-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                This action cannot be undone.
              </p>
            </div>
            
            <div className="flex flex-col space-y-3">
              <button 
                onClick={handleUpdateProfile}
                disabled={isUpdatingProfile}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-lg shadow-indigo-100"
              >
                {isUpdatingProfile ? <Loader2 size={20} className="animate-spin" /> : <span>Confirm & Start Fresh</span>}
              </button>
              <button 
                onClick={() => setShowProfileResetModal(false)}
                className="w-full px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Unit Delete Confirmation Modal */}
      {unitToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Unit?</h2>
            <div className="text-slate-500 mb-6 text-sm leading-relaxed">
              Are you sure you want to delete "<span className="font-semibold text-slate-700">{unitToDelete.unitName}</span>"? 
              <br /><br />
              This will also remove:
              <ul className="text-left mt-2 space-y-1 list-disc list-inside">
                <li>All associated exams and CATs</li>
                <li>AI Study Plan tasks for this unit</li>
                <li>Revision plans for associated exams</li>
              </ul>
              <span className="block mt-4 italic">Your schedule will be automatically recalculated.</span>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setUnitToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteUnit}
                className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Exam Delete Confirmation Modal */}
      {examToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Exam/CAT?</h2>
            <div className="text-slate-500 mb-6 text-sm leading-relaxed">
              Are you sure you want to delete this <span className="font-semibold text-slate-700">{examToDelete.type}</span> for <span className="font-semibold text-slate-700">{examToDelete.unitName}</span>?
              <br /><br />
              <span className="block italic">This will also remove any AI-generated revision plans for this exam.</span>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setExamToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteExam}
                className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Exam Period Delete Confirmation Modal */}
      {showExamPeriodDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Exam Period?</h2>
            <div className="text-slate-500 mb-6 text-sm leading-relaxed">
              Are you sure you want to delete the semester exam period?
              <br /><br />
              <span className="text-rose-600 font-bold">Warning:</span> This will reset your entire schedule to re-include classes during those dates.
            </div>
            
            <div className="flex flex-col space-y-3">
              <button 
                onClick={handleDeleteExamPeriod}
                disabled={isUpdatingExamPeriod}
                className="w-full px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 shadow-lg shadow-rose-100"
              >
                {isUpdatingExamPeriod ? <Loader2 size={20} className="animate-spin" /> : <span>Confirm & Delete</span>}
              </button>
              <button 
                onClick={() => setShowExamPeriodDeleteModal(false)}
                className="w-full px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Duplicate Plan Notification Modal */}
      {duplicatePlanModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-500">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              {duplicatePlanModal.type === 'study' ? 'Study Plan Already Exists' : 'Revision Plan Already Exists'}
            </h2>
            <p className="text-slate-500 mb-6 text-sm leading-relaxed">
              {duplicatePlanModal.type === 'study' 
                ? 'You already have an active Study Plan for this semester. Generating a new one will replace your current study tasks.'
                : `A Revision Plan for ${duplicatePlanModal.exam?.unitName} ${duplicatePlanModal.exam?.type} has already been created.`}
            </p>
            
            <div className="flex flex-col space-y-3">
              <button 
                onClick={() => {
                  setDuplicatePlanModal(null);
                  navigate('/todos');
                }}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-100"
              >
                <CheckCircle2 size={18} />
                <span>View Existing Plan</span>
              </button>
              
              <button 
                onClick={handleRegeneratePlan}
                className="w-full px-4 py-3 bg-white text-rose-600 border border-rose-100 font-bold rounded-xl hover:bg-rose-50 transition-all flex items-center justify-center space-x-2"
              >
                <RefreshCw size={18} />
                <span>Delete & Regenerate</span>
              </button>
              
              <button 
                onClick={() => setDuplicatePlanModal(null)}
                className="w-full px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Semester;
