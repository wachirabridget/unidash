import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, CheckSquare, Calendar, Clock, CheckCircle2, Circle, Loader2, Edit2, Trash2, ArrowLeft, RotateCcw, X, Timer, BookOpen, Sparkles } from 'lucide-react';
import { format, parseISO, isToday, isTomorrow, startOfDay, compareAsc, isBefore, addMinutes } from 'date-fns';

const Todos = () => {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [todoToDelete, setTodoToDelete] = useState<any>(null);
  const [editingTodo, setEditingTodo] = useState<any>(null);
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [formData, setFormData] = useState({
    activity: '',
    date: new Date().toISOString().split('T')[0],
    priority: '',
    fixedTime: '',
    duration: 60,
    type: 'task'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [todosData, scheduleData] = await Promise.all([
        api.todos.getAll(),
        api.schedule.get()
      ]);
      setTodos(todosData);
      setSchedule(scheduleData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalData = { ...formData };
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    
    // Time-Aware Scheduling for Late Entries
    if (!editingTodo && finalData.date === todayStr && !finalData.fixedTime) {
      const minutes = now.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 15) * 15;
      const scheduledTime = addMinutes(startOfDay(now), now.getHours() * 60 + roundedMinutes);
      finalData.fixedTime = format(scheduledTime, 'HH:mm');
    }

    // Prevent past scheduling
    const selectedDate = parseISO(finalData.date);
    if (isBefore(selectedDate, startOfDay(now))) {
      alert('Cannot schedule tasks in the past.');
      return;
    }

    if (editingTodo) {
      await api.todos.update(editingTodo.id, finalData);
    } else {
      await api.todos.create(finalData);
    }
    setShowForm(false);
    setEditingTodo(null);
    setFormData({
      activity: '',
      date: new Date().toISOString().split('T')[0],
      priority: '',
      fixedTime: '',
      duration: 60,
      type: 'task'
    });
    fetchData();
  };

  const handleEdit = (todo: any) => {
    setEditingTodo(todo);
    setFormData({
      activity: todo.activity,
      date: todo.date,
      priority: todo.priority || '',
      fixedTime: todo.fixedTime || '',
      duration: todo.duration || 60,
      type: todo.type || 'task'
    });
    setShowForm(true);
  };

  const handleDelete = (todo: any) => {
    setTodoToDelete(todo);
  };

  const confirmDelete = async () => {
    if (!todoToDelete) return;
    const todo = { ...todoToDelete };
    const id = todo.id;
    
    try {
      // Optimistic update
      setTodos(prev => prev.filter(t => t.id !== id));
      setTodoToDelete(null);
      
      const response = await api.todos.delete(id);
      if (response.error) {
        throw new Error(response.error);
      }

      // Set undo action
      showUndo('Task deleted', async () => {
        await api.todos.create({
          activity: todo.activity,
          date: todo.date,
          priority: todo.priority,
          fixedTime: todo.fixedTime,
          duration: todo.duration
        });
        fetchData();
      });

      // Refresh to ensure sync with schedule
      fetchData();
    } catch (err) {
      console.error('Failed to delete todo:', err);
      alert('Failed to delete task. Please try again.');
      fetchData(); // Revert optimistic update
    }
  };

  const toggleTodo = async (todo: any) => {
    const oldStatus = todo.status;
    const newStatus = oldStatus === 'completed' ? 'pending' : 'completed';
    
    try {
      // Optimistic update
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: newStatus } : t));
      
      await api.todos.update(todo.id, { status: newStatus });
      
      showUndo(`Task marked as ${newStatus}`, async () => {
        await api.todos.update(todo.id, { status: oldStatus });
        fetchData();
      });

      fetchData();
    } catch (err) {
      console.error('Failed to toggle todo:', err);
      fetchData();
    }
  };

  const handleBulkComplete = async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => api.todos.update(id, { status: 'completed' })));
      setSelectedIds(new Set());
      fetchData();
      showUndo(`${ids.length} tasks marked as completed`, async () => {
        await Promise.all(ids.map(id => api.todos.update(id, { status: 'pending' })));
        fetchData();
      });
    } catch (err) {
      console.error('Bulk complete failed:', err);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!confirm(`Are you sure you want to delete ${ids.length} tasks?`)) return;
    
    try {
      await Promise.all(ids.map(id => api.todos.delete(id)));
      setSelectedIds(new Set());
      fetchData();
      showUndo(`${ids.length} tasks deleted`, async () => {
        // This is a bit complex to undo bulk delete perfectly without full state backup
        // For now, just refresh
        fetchData();
      });
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  const toggleSelection = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
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

  const groupedTodos = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);

    const combined = [
      ...todos.map(t => ({ ...t, isTodo: true })),
      ...schedule
        .filter(s => s.type === 'work' || s.type === 'class')
        .map(s => ({
          ...s,
          isScheduleItem: true,
          activity: s.title,
          date: format(parseISO(s.startTime), 'yyyy-MM-dd'),
          fixedTime: format(parseISO(s.startTime), 'HH:mm'),
          duration: (parseISO(s.endTime).getTime() - parseISO(s.startTime).getTime()) / 60000
        }))
    ];

    const filtered = combined.filter(item => {
      if (showHistory) {
        // History: All completed todos + past schedule items
        return item.status === 'completed' || (item.isScheduleItem && isBefore(parseISO(item.date), todayStart));
      } else {
        // Active: All pending todos + current/future schedule items
        return item.status !== 'completed' && (!item.isScheduleItem || !isBefore(parseISO(item.date), todayStart));
      }
    });

    const sorted = filtered.sort((a, b) => {
      const dateA = parseISO(a.date);
      const dateB = parseISO(b.date);
      const dateCompare = compareAsc(dateA, dateB);
      
      if (dateCompare !== 0) return dateCompare;
      
      // If same date, sort by time
      if (a.fixedTime && b.fixedTime) {
        return a.fixedTime.localeCompare(b.fixedTime);
      }
      if (a.fixedTime) return -1;
      if (b.fixedTime) return 1;
      
      return 0;
    });

    const groups: { [key: string]: any[] } = {};
    sorted.forEach(item => {
      if (!groups[item.date]) {
        groups[item.date] = [];
      }
      groups[item.date].push(item);
    });

    return Object.entries(groups).map(([date, items]) => ({
      date,
      items
    }));
  }, [todos, schedule, showHistory]);

  const getDayLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMMM d');
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  const getPriorityColor = (p: string | null | undefined) => {
    if (!p || p === 'none') return 'hidden';
    switch (p) {
      case 'high': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'low': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      default: return 'hidden';
    }
  };

  const handleQuickAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && formData.activity.trim()) {
      await api.todos.create(formData);
      setFormData({
        ...formData,
        activity: '',
      });
      fetchData();
    }
  };

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
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Tasks & Todos</h1>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${showHistory ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            {showHistory ? 'Show Active' : 'Show History'}
          </button>
          {todos.length > 0 && !showHistory && (
            <button 
              onClick={() => {
                if (selectedIds.size === todos.filter(t => t.status !== 'completed').length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(todos.filter(t => t.status !== 'completed').map(t => t.id)));
                }
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              {selectedIds.size === todos.filter(t => t.status !== 'completed').length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 w-full sm:w-auto"
        >
          <Plus size={20} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] bg-white border border-slate-200 px-6 py-4 rounded-3xl shadow-2xl flex items-center space-x-8"
          >
            <div className="flex items-center space-x-3">
              <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedIds.size}
              </span>
              <span className="text-sm font-bold text-slate-600 tracking-tight">Tasks Selected</span>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="flex items-center space-x-2">
              <button 
                onClick={handleBulkComplete}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-all"
              >
                <CheckSquare size={18} />
                <span>Complete</span>
              </button>
              <button 
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-100 transition-all"
              >
                <Trash2 size={18} />
                <span>Delete</span>
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Quick Add Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
          <Plus size={20} />
        </div>
        <input 
          type="text" 
          placeholder="Quick add a task (press Enter)..."
          value={formData.activity}
          onChange={(e) => setFormData({...formData, activity: e.target.value})}
          onKeyDown={handleQuickAdd}
          className="flex-1 bg-transparent border-none outline-none font-medium text-slate-700 placeholder:text-slate-300"
        />
        <div className="flex items-center space-x-2 pr-2">
          <select 
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
            className="text-xs font-bold bg-slate-50 border-none rounded-lg px-2 py-1 outline-none text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <option value="task">Task</option>
            <option value="chore">Chore</option>
          </select>
          <div className="w-px h-4 bg-slate-200" />
          <select 
            value={formData.priority || ''}
            onChange={(e) => setFormData({...formData, priority: e.target.value})}
            className="text-xs font-bold bg-slate-50 border-none rounded-lg px-2 py-1 outline-none text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <option value="">No Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="space-y-12">
        {showHistory && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Task History (Completed)</span>
            <button 
              onClick={() => setShowHistory(false)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              Return to Active
            </button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
        ) : groupedTodos.length > 0 ? (
          groupedTodos.map((group, groupIdx) => (
            <div key={group.date} className="space-y-4">
              <div className="flex items-center space-x-4">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">
                  {getDayLabel(group.date)}
                </h2>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="grid grid-cols-1 gap-4">
                {group.items.map((todo, i) => (
                  <motion.div 
                    key={todo.isScheduleItem ? `s-${todo.id}` : todo.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => !todo.isScheduleItem && toggleSelection(todo.id)}
                    className={`bg-white p-6 rounded-3xl border transition-all hover:shadow-md group/item flex items-center space-x-6 cursor-pointer ${
                      selectedIds.has(todo.id) 
                        ? 'border-indigo-600 ring-2 ring-indigo-50 shadow-lg' 
                        : 'border-slate-100 shadow-sm hover:border-indigo-100'
                    } ${todo.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center space-x-4">
                      {!todo.isScheduleItem && (
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          selectedIds.has(todo.id) 
                            ? 'bg-indigo-600 border-indigo-600' 
                            : 'border-slate-200 group-hover/item:border-indigo-300'
                        }`}>
                          {selectedIds.has(todo.id) && <CheckSquare size={14} className="text-white" />}
                        </div>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          todo.isScheduleItem ? api.schedule.update(todo.id, todo.status === 'completed' ? 'pending' : 'completed').then(fetchData) : toggleTodo(todo);
                        }}
                        className={`transition-colors ${todo.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-600'}`}
                      >
                        {todo.status === 'completed' ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                      </button>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <h3 className={`text-lg font-bold text-slate-900 ${todo.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                          {todo.activity}
                        </h3>
                        {todo.type === 'chore' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                            <Sparkles size={10} />
                            <span>Chore</span>
                          </span>
                        )}
                        {todo.type === 'class' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                            <BookOpen size={10} />
                            <span>Class</span>
                          </span>
                        )}
                        {todo.type === 'work' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider border border-rose-100">
                            <Clock size={10} />
                            <span>Work</span>
                          </span>
                        )}
                        {todo.relatedType === 'exam' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                            <Sparkles size={10} />
                            <span>Revision</span>
                          </span>
                        )}
                        {todo.relatedType === 'study_plan' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                            <BookOpen size={10} />
                            <span>Study Plan</span>
                          </span>
                        )}
                        {todo.relatedType === 'internship_task' && (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                            <Sparkles size={10} />
                            <span>Internship</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4">
                        {todo.fixedTime && (
                          <div className="flex items-center space-x-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                            <Clock size={14} />
                            <span>{todo.fixedTime}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1 text-xs font-medium text-slate-400">
                          <Timer size={14} className="opacity-50" />
                          <span>{formatDuration(todo.duration || 60)}</span>
                        </div>
                        {todo.deadline && (
                          <div className="flex items-center space-x-1 text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                            <Clock size={12} />
                            <span>Due: {new Date(todo.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {todo.priority && todo.priority !== 'none' && todo.priority !== '' && (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${getPriorityColor(todo.priority)}`}>
                        {todo.priority}
                      </span>
                    )}

                    <div className="flex items-center space-x-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      {!todo.isScheduleItem && (
                        <>
                          <button 
                            onClick={() => handleEdit(todo)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(todo)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white p-16 rounded-3xl border border-dashed border-slate-200 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
              <CheckSquare size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">All caught up!</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-8">Add your daily tasks and let UniDash find the perfect time for them in your schedule.</p>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold inline-flex items-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Plus size={20} />
              <span>Create Your First Task</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {todoToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Task?</h2>
            <p className="text-slate-500 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700">{todoToDelete.activity}</span>"? This action cannot be undone.</p>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setTodoToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Todo Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{editingTodo ? 'Edit Task' : 'Add Task'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Activity</label>
                <input 
                  type="text" 
                  required
                  value={formData.activity}
                  onChange={(e) => setFormData({...formData, activity: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Buy groceries"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                  <input 
                    type="date" 
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="task">Standard Task</option>
                    <option value="chore">Daily Chore</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Priority</label>
                  <select 
                    value={formData.priority || ''}
                    onChange={(e) => setFormData({...formData, priority: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None (Optional)</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Fixed Time (Optional)</label>
                  <input 
                    type="time" 
                    value={formData.fixedTime}
                    onChange={(e) => setFormData({...formData, fixedTime: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Duration</label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 relative">
                    <input 
                      type="number" 
                      min="0"
                      value={Math.floor(formData.duration / 60)}
                      onChange={(e) => {
                        const h = Math.max(0, parseInt(e.target.value) || 0);
                        const m = formData.duration % 60;
                        setFormData({...formData, duration: h * 60 + m});
                      }}
                      className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">h</span>
                  </div>
                  <div className="flex-1 relative">
                    <input 
                      type="number" 
                      min="0"
                      max="59"
                      value={formData.duration % 60}
                      onChange={(e) => {
                        const m = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                        const h = Math.floor(formData.duration / 60);
                        setFormData({...formData, duration: h * 60 + m});
                      }}
                      className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">m</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTodo(null);
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  {editingTodo ? 'Update Task' : 'Save Task'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Todos;
