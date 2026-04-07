import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Droplets,
  RefreshCw,
  Plus,
  Zap,
  FolderKanban,
  Timer,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  MoreVertical,
  Brain,
  Bell,
  BookOpen
} from 'lucide-react';
import { 
  format, 
  isToday, 
  parseISO, 
  addDays, 
  isAfter, 
  isBefore, 
  isSameWeek, 
  isSameMonth, 
  isSameYear,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { permission, requestPermission, error: notificationError, isSupported } = useNotifications();
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [selectedYearMonth, setSelectedYearMonth] = useState<number | 'all'>('all');
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [quickTask, setQuickTask] = useState('');
  const [hydrationTotal, setHydrationTotal] = useState(0);
  const [stats, setStats] = useState({
    completed: 0,
    total: 0,
    streak: user?.streak || 0,
    overdue: 0,
    totalProjects: 0,
    upcomingDeadlines: 0
  });

  const fetchHydration = async () => {
    try {
      const res = await api.health.getHydration();
      if (!res.error) {
        setHydrationTotal(res.total);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogHydration = async (amount_ml: number) => {
    try {
      const res = await api.health.logHydration(amount_ml);
      if (!res.error) {
        fetchHydration();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetHydration = async () => {
    try {
      const res = await api.health.resetHydration();
      if (!res.error) {
        fetchHydration();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSchedule = async (autoGenerate = false) => {
    setLoading(true);
    try {
      const [scheduleData, projectsData, examsData] = await Promise.all([
        api.schedule.get(),
        api.projects.getAll(),
        api.units.getExams()
      ]);
      
      let currentSchedule = scheduleData;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const safeParseISO = (dateStr: string) => {
        const d = parseISO(dateStr);
        return isNaN(d.getTime()) ? new Date() : d;
      };

      const todayItems = currentSchedule.filter((item: any) => {
        try {
          return format(safeParseISO(item.startTime), 'yyyy-MM-dd') === todayStr;
        } catch (e) {
          return false;
        }
      });

      // Auto-generate if empty and requested
      if (autoGenerate && todayItems.length === 0) {
        await api.schedule.generate({ startDate: format(new Date(), 'yyyy-MM-dd') });
        currentSchedule = await api.schedule.get();
      }
      
      setSchedule(currentSchedule);
      
      const latestTodayItems = currentSchedule.filter((item: any) => {
        try {
          return format(safeParseISO(item.startTime), 'yyyy-MM-dd') === todayStr;
        } catch (e) {
          return false;
        }
      });
      
      // Calculate upcoming deadlines (next 7 days)
      const nextWeek = addDays(new Date(), 7);
      const now = new Date();
      
      const upcomingProjectDeadlines = projectsData.filter((p: any) => {
        if (!p.deadline) return false;
        const deadline = parseISO(p.deadline);
        if (isNaN(deadline.getTime())) return false;
        return isAfter(deadline, now) && isBefore(deadline, nextWeek);
      }).length;

      const upcomingExamDeadlines = examsData.filter((e: any) => {
        if (!e.dateTime) return false;
        const deadline = parseISO(e.dateTime);
        if (isNaN(deadline.getTime())) return false;
        return isAfter(deadline, now) && isBefore(deadline, nextWeek);
      }).length;

      setStats(prev => ({
        ...prev,
        total: todayItems.length,
        completed: todayItems.filter((item: any) => item.status === 'completed').length,
        streak: user?.streak || 0,
        overdue: scheduleData.filter((item: any) => {
          if (!item.endTime) return false;
          const end = parseISO(item.endTime);
          return item.status === 'pending' && !isNaN(end.getTime()) && end < new Date();
        }).length,
        totalProjects: projectsData.length,
        upcomingDeadlines: upcomingProjectDeadlines + upcomingExamDeadlines
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule(true);
    fetchHydration();
  }, []);

  useEffect(() => {
    if (view === 'year') {
      setSelectedYearMonth('all');
    }
  }, [view]);

  const handleGenerate = async () => {
    setLoading(true);
    // Generate more days if we are in a wider view
    const daysToGenerate = view === 'month' ? 30 : view === 'year' ? 365 : 7;
    const startDate = view === 'year' ? format(startOfYear(now), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    await api.schedule.generate({ startDate, days: daysToGenerate });
    await fetchSchedule();
  };

  const toggleStatus = async (item: any) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    await api.schedule.update(item.id, newStatus);
    await refreshUser();
    fetchSchedule();
  };

  const handleQuickNote = async (item: any, predefinedNote?: string) => {
    const note = predefinedNote || prompt(`Add a quick note for "${item.title}":`);
    if (note !== null) {
      try {
        if (item.type === 'project') {
          await api.projects.updateTask(item.relatedId, undefined, note);
        } else if (item.type === 'todo') {
          await api.todos.update(item.relatedId, { note });
        }
        alert('Note saved successfully!');
      } catch (err) {
        console.error(err);
        alert('Failed to save note.');
      }
    }
  };

  const handleQuickAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && quickTask.trim()) {
      setLoading(true);
      try {
        await api.todos.create({
          activity: quickTask,
          date: format(new Date(), 'yyyy-MM-dd'),
          priority: 'medium',
          duration: 30
        });
        setQuickTask('');
        await handleGenerate(); // Auto-sync after quick add
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();
  
  const safeFormat = (dateStr: string, fmt: string) => {
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return format(d, fmt);
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const filteredSchedule = schedule.filter(item => {
    try {
      const d = parseISO(item.startTime);
      if (isNaN(d.getTime())) return false;
      
      if (view === 'today') return format(d, 'yyyy-MM-dd') === todayStr;
      if (view === 'week') return isSameWeek(d, now, { weekStartsOn: 1 });
      if (view === 'month') return isSameMonth(d, now);
      if (view === 'year') {
        const sameYear = isSameYear(d, now);
        if (!sameYear) return false;
        if (selectedYearMonth === 'all') return true;
        return d.getMonth() === selectedYearMonth;
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }).sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());

  const todaySchedule = schedule.filter(item => {
    try {
      const d = parseISO(item.startTime);
      return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === todayStr;
    } catch (e) {
      return false;
    }
  });

  const futureSchedule = schedule.filter(item => {
    try {
      const d = parseISO(item.startTime);
      return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') > todayStr;
    } catch (e) {
      return false;
    }
  });

  return (
    <div className="space-y-8">
      {/* Notification Permission Banner */}
      {permission === 'default' && isSupported && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-600 p-4 rounded-2xl text-white flex items-center justify-between shadow-lg shadow-indigo-200"
        >
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-white/20 rounded-xl">
              <Bell size={20} />
            </div>
            <div>
              <p className="font-bold text-sm">Stay on track!</p>
              <p className="text-xs text-indigo-100">Enable browser notifications for timely task alerts.</p>
            </div>
          </div>
          <button 
            onClick={requestPermission}
            className="px-4 py-2 bg-white text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-50 transition-all"
          >
            Enable Now
          </button>
        </motion.div>
      )}

      {notificationError && permission !== 'granted' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-600 p-4 rounded-2xl text-white flex items-center justify-between shadow-lg shadow-rose-200"
        >
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-white/20 rounded-xl">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="font-bold text-sm">Notification Error</p>
              <p className="text-xs text-rose-100">{notificationError}</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/settings')}
            className="px-4 py-2 bg-white text-rose-600 rounded-xl font-bold text-xs hover:bg-rose-50 transition-all"
          >
            Go to Settings
          </button>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Add Unit', to: '/semester', icon: BookOpen },
          { label: 'New Project', to: '/projects', icon: FolderKanban },
          { label: 'Add Todo', to: '/todos', icon: Plus },
        ].map((action, i) => (
          <button 
            key={i}
            onClick={() => navigate(action.to)}
            className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-bold transition-all group"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-slate-50 group-hover:bg-white rounded-xl transition-colors">
                <action.icon size={18} className="text-slate-400 group-hover:text-indigo-600" />
              </div>
              <span>{action.label}</span>
            </div>
            <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600 transition-transform group-hover:translate-x-1" />
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            {view === 'today' ? "Today's Overview" : 
             view === 'week' ? "Weekly Schedule" : 
             view === 'month' ? "Monthly Schedule" : 
             "Yearly Schedule"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-slate-500">
              {view === 'today' ? format(new Date(), 'EEEE, MMMM do') :
               view === 'week' ? `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM do')} - ${format(endOfWeek(now, { weekStartsOn: 1 }), 'MMM do')}` :
               view === 'month' ? format(now, 'MMMM yyyy') :
               format(now, 'yyyy')}
            </p>
            {user?.yearOfStudy && user?.semesterType && (
              <div className="flex items-center space-x-2">
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                  Year {user.yearOfStudy}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">
                  {user.semesterType}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col xs:flex-row items-stretch sm:items-center gap-3">
          {/* View Switcher */}
          <div className="bg-white p-1 rounded-xl border border-slate-100 shadow-sm flex items-center overflow-x-auto no-scrollbar">
            {(['today', 'week', 'month', 'year'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                  view === v 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                    : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          
          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 text-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Month Switcher for Yearly View */}
      <AnimatePresence>
        {view === 'year' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative"
          >
            <div className="flex items-center space-x-3">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Filter by Month:</span>
              <div className="relative">
                <button
                  onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                  className="bg-white border border-slate-100 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-700 shadow-sm flex items-center space-x-2 hover:border-indigo-200 transition-all min-w-[160px] justify-between"
                >
                  <span>
                    {selectedYearMonth === 'all' 
                      ? 'All Months' 
                      : format(new Date(now.getFullYear(), selectedYearMonth as number, 1), 'MMMM')}
                  </span>
                  <ChevronDown size={16} className={`transition-transform ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isMonthDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-[60]" 
                        onClick={() => setIsMonthDropdownOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 5 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute left-0 top-full z-[70] w-48 bg-white rounded-2xl border border-slate-100 shadow-xl p-2 overflow-hidden"
                      >
                        <button
                          onClick={() => {
                            setSelectedYearMonth('all');
                            setIsMonthDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            selectedYearMonth === 'all'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          All Months
                        </button>
                        <div className="h-px bg-slate-50 my-1" />
                        <div className="max-h-60 overflow-y-auto no-scrollbar">
                          {Array.from({ length: 12 }, (_, i) => {
                            const monthDate = new Date(now.getFullYear(), i, 1);
                            const monthName = format(monthDate, 'MMMM');
                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  setSelectedYearMonth(i);
                                  setIsMonthDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                  selectedYearMonth === i
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {monthName}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Add Bar */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 flex items-center space-x-3 sm:space-x-4 focus-within:ring-2 focus-within:ring-indigo-500 transition-all"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
          <Plus size={18} className="sm:w-5 sm:h-5" />
        </div>
        <input 
          type="text" 
          placeholder="Quick add a task... (press Enter)"
          value={quickTask}
          onChange={(e) => setQuickTask(e.target.value)}
          onKeyDown={handleQuickAdd}
          className="flex-1 bg-transparent border-none outline-none font-medium text-slate-700 placeholder:text-slate-300 text-sm sm:text-base"
        />
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
        {[
          { label: 'Tasks Today', value: stats.total, icon: CalendarIcon, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Total Projects', value: stats.totalProjects, icon: FolderKanban, color: 'bg-blue-50 text-blue-600' },
          { label: 'Deadlines (7d)', value: stats.upcomingDeadlines, icon: Timer, color: 'bg-rose-50 text-rose-600' },
          { label: 'Day Streak', value: stats.streak, icon: Zap, color: 'bg-amber-50 text-amber-600' },
          { label: 'Overdue', value: stats.overdue, icon: AlertCircle, color: 'bg-slate-50 text-slate-600' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100"
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 ${stat.color} rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4`}>
              <stat.icon size={20} className="sm:w-6 sm:h-6" />
            </div>
            <p className="text-[10px] sm:text-sm font-medium text-slate-500 truncate">{stat.label}</p>
            <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-0.5 sm:mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Schedule List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">
              {view === 'today' ? 'Timeline' : 
               view === 'week' ? 'Weekly Timeline' : 
               view === 'month' ? 'Monthly Timeline' : 
               'Yearly Timeline'}
            </h2>
            <div className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              {filteredSchedule.length} sessions
            </div>
          </div>

          <div className="space-y-8">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-3xl" />)}
              </div>
            ) : filteredSchedule.length > 0 ? (
              view === 'year' ? (
                // Group by month for yearly view
                Object.entries(
                  filteredSchedule.reduce((acc: Record<string, any[]>, item) => {
                    const monthKey = format(parseISO(item.startTime), 'yyyy-MM');
                    if (!acc[monthKey]) acc[monthKey] = [];
                    acc[monthKey].push(item);
                    return acc;
                  }, {})
                )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([monthKey, items]) => {
                  const monthDisplay = format(parseISO(monthKey + '-01'), 'MMMM yyyy');
                  return (
                    <div key={monthKey} className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-900 sticky top-0 bg-slate-50/80 backdrop-blur-sm py-2 z-10">
                        {monthDisplay}
                      </h3>
                      <div className="overflow-x-auto rounded-3xl border border-slate-100 shadow-sm bg-white">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">Date</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">Time Range</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Activity & Description</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">Category</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-24">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(items as any[]).map((item, i) => (
                              <tr 
                                key={item.id}
                                className={`group hover:bg-slate-50/30 transition-colors ${item.status === 'completed' ? 'opacity-60' : ''}`}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-900">
                                      {safeFormat(item.startTime, 'EEE do')}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium uppercase">
                                      {safeFormat(item.startTime, 'MMM')}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center text-xs text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded-lg w-fit">
                                    <Clock size={12} className="mr-1.5 text-slate-400" />
                                    {safeFormat(item.startTime, 'HH:mm')} - {safeFormat(item.endTime, 'HH:mm')}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center space-x-3">
                                    <div className={`shrink-0 w-2 h-2 rounded-full shadow-sm ${
                                      item.type === 'class' ? 'bg-blue-500' : 
                                      item.type === 'study' ? 'bg-indigo-500' : 
                                      item.type === 'study_plan' ? 'bg-emerald-500' : 
                                      item.type === 'project' ? 'bg-amber-500' : 
                                      item.type === 'bootcamp' ? 'bg-purple-500' :
                                      item.type === 'work' ? 'bg-rose-500' :
                                      item.type === 'exam' ? 'bg-rose-600' :
                                      item.type === 'cat' ? 'bg-amber-600' :
                                      'bg-slate-400'
                                    }`} />
                                    <div className="min-w-0">
                                      <p className={`text-sm font-bold text-slate-900 truncate ${item.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                                        {item.title}
                                      </p>
                                      {item.note && (
                                        <p className="text-[10px] text-slate-400 truncate mt-0.5 italic">"{item.note}"</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
                                    item.type === 'class' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                    item.type === 'bootcamp' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                    item.type === 'work' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    item.type === 'exam' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    item.type === 'cat' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                    'bg-slate-50 text-slate-500 border-slate-100'
                                  }`}>
                                    {item.type}
                                  </span>
                                  {item.workingDays && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(typeof item.workingDays === 'string' ? JSON.parse(item.workingDays) : item.workingDays).map((day: string) => (
                                        <span key={day} className="text-[8px] font-bold text-indigo-500 bg-indigo-50/50 px-1 py-0.5 rounded-sm border border-indigo-100/50">
                                          {day.slice(0, 3)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                  <button 
                                    onClick={() => toggleStatus(item)}
                                    className={`inline-flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
                                      item.status === 'completed' 
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' 
                                        : 'bg-white border border-slate-200 text-slate-300 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50'
                                    }`}
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              ) : (
                filteredSchedule.map((item, i) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`group bg-white p-4 md:p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center space-x-4 md:space-x-6 ${item.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    <div className="text-center min-w-[60px] md:min-w-[80px]">
                      <p className="text-sm font-bold text-slate-900">
                        {view === 'today' ? safeFormat(item.startTime, 'HH:mm') : safeFormat(item.startTime, 'MMM do')}
                      </p>
                      <p className="text-xs text-slate-400 font-medium">
                        {view === 'today' ? safeFormat(item.endTime, 'HH:mm') : safeFormat(item.startTime, 'HH:mm')}
                      </p>
                    </div>
                  
                  <div className="w-px h-12 bg-slate-100" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={`shrink-0 w-2 h-2 rounded-full ${
                        item.type === 'class' ? 'bg-blue-500' : 
                        item.type === 'study' ? 'bg-indigo-500' : 
                        item.type === 'study_plan' ? 'bg-emerald-500' : 
                        item.type === 'project' ? 'bg-amber-500' : 
                        item.type === 'bootcamp' ? 'bg-purple-500' :
                        item.type === 'work' ? 'bg-rose-500' :
                        item.type === 'internship_task' ? 'bg-emerald-500' :
                        item.type === 'internship_subtask' ? 'bg-emerald-400' :
                        item.type === 'exam' ? 'bg-rose-600' :
                        item.type === 'cat' ? 'bg-amber-600' :
                        'bg-slate-400'
                      }`} />
                      <p className={`font-bold text-slate-900 truncate ${item.status === 'completed' ? 'line-through' : ''}`}>
                        {item.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.type}</p>
                      {item.workingDays && (
                        <div className="flex flex-wrap gap-1">
                          {(typeof item.workingDays === 'string' ? JSON.parse(item.workingDays) : item.workingDays).map((day: string) => (
                            <span key={day} className="text-[9px] font-bold text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded-md border border-indigo-100/50">
                              {day.slice(0, 3)}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.type === 'project' && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleQuickNote(item)}
                            className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center space-x-1 bg-indigo-50 px-2 py-0.5 rounded-md"
                          >
                            <MessageSquare size={10} />
                            <span>Note</span>
                          </button>
                          {['Stuck', 'Done', 'Break'].map(resp => (
                            <button 
                              key={resp}
                              onClick={() => handleQuickNote(item, resp)}
                              className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors"
                            >
                              {resp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => toggleStatus(item)}
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        item.status === 'completed' 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-slate-50 text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                      }`}
                    >
                      <CheckCircle2 size={20} />
                    </button>
                  </div>
                </motion.div>
              ))
            )) : (
              <div className="space-y-6">
                <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <CalendarIcon size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    No tasks scheduled for {view === 'today' ? 'today' : 
                                       view === 'week' ? 'this week' : 
                                       view === 'month' ? 'this month' : 
                                       'this year'}
                  </h3>
                  <p className="text-slate-500 mt-1 mb-6">You have {stats.totalProjects} active projects. Sync your schedule to organize your tasks.</p>
                  <button 
                    onClick={handleGenerate}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Sync Now
                  </button>
                </div>

                {futureSchedule.length > 0 && (
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Coming Up Tomorrow</h3>
                    <div className="space-y-3">
                      {futureSchedule.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-400" />
                            <span className="font-semibold text-slate-700">{item.title}</span>
                          </div>
                          <span className="text-xs font-bold text-slate-400">{safeFormat(item.startTime, 'MMM do, HH:mm')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          {/* Project Progress Widget */}
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Projects</h3>
              <Link to="/projects" className="text-xs font-bold text-indigo-600 hover:underline">View All</Link>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Active Projects</span>
                <span className="text-sm font-bold text-slate-900">{stats.totalProjects}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Upcoming Deadlines</span>
                <span className="text-sm font-bold text-rose-600">{stats.upcomingDeadlines}</span>
              </div>
            </div>
          </div>

          {/* Hydration Reminder */}
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-3xl text-white shadow-lg shadow-blue-100">
            <div className="flex items-center justify-between mb-6">
              <Droplets size={32} />
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleResetHydration}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-white/60 hover:text-white"
                  title="Reset today's progress"
                >
                  <RefreshCw size={14} />
                </button>
                <span className="text-xs font-bold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">Health</span>
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2">Stay Hydrated</h3>
            <div className="flex items-end justify-between mb-2">
              <p className="text-blue-100 text-sm">
                {hydrationTotal >= 2000 
                  ? "Goal reached! Excellent hydration." 
                  : `${Math.max(2000 - hydrationTotal, 0)}ml remaining to reach goal.`}
              </p>
              <span className="text-xs font-bold opacity-80 text-right">
                {hydrationTotal / 1000}L / 2L<br />
                {Math.floor(hydrationTotal / 250)} / 8 Glasses
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-6">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((hydrationTotal / 2000) * 100, 100)}%` }}
                className="h-full bg-white" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button 
                onClick={() => handleLogHydration(250)}
                className="flex items-center justify-center space-x-2 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/10"
              >
                <Plus size={16} />
                <span>1 Glass</span>
              </button>
              <button 
                onClick={() => handleLogHydration(500)}
                className="flex items-center justify-center space-x-2 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/10"
              >
                <Plus size={16} />
                <span>0.5 Liters</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <input 
                type="number" 
                placeholder="Custom (ml)"
                className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold placeholder:text-white/40 outline-none focus:bg-white/20 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (val > 0) {
                      handleLogHydration(val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <button 
                onClick={(e) => {
                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                  const val = parseInt(input.value);
                  if (val > 0) {
                    handleLogHydration(val);
                    input.value = '';
                  }
                }}
                className="p-2 bg-white text-indigo-600 rounded-xl hover:bg-blue-50 transition-all"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
