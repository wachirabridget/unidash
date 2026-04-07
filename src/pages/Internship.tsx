import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Briefcase, Calendar, Clock, MapPin, Loader2, ArrowLeft, CheckCircle2, Circle, Trash2, MessageSquare, Sparkles, Edit2, RotateCcw, X } from 'lucide-react';
import { aiService } from '../services/aiService';

const Internship = () => {
  const navigate = useNavigate();
  const [internships, setInternships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isEditingInternship, setIsEditingInternship] = useState(false);
  const [editingInternshipId, setEditingInternshipId] = useState<number | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [generatingTaskAI, setGeneratingTaskAI] = useState(false);
  const [selectedInternshipId, setSelectedInternshipId] = useState<number | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [showTaskValidationErrors, setShowTaskValidationErrors] = useState(false);
  const [showTaskDateValidationErrors, setShowTaskDateValidationErrors] = useState(false);
  const [showTaskBreakdownError, setShowTaskBreakdownError] = useState(false);
  const [formData, setFormData] = useState({
    role: '',
    workType: 'hybrid',
    workingDays: [] as string[],
    workingHours: '09:00-17:00',
    startMonth: 'January',
    startYear: new Date().getFullYear(),
    endMonth: 'March',
    endYear: new Date().getFullYear()
  });
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    subtasks: [] as { title: string }[]
  });

  const [internshipToDelete, setInternshipToDelete] = useState<any>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    type: 'alert' | 'confirm' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showAlert = (title: string, message: string) => {
    setModal({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({ isOpen: true, title, message, onConfirm, type: 'confirm' });
  };

  const showWarning = (title: string, message: string, onConfirm: () => void) => {
    setModal({ isOpen: true, title, message, onConfirm, type: 'warning' });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.internships.getAll();
      setInternships(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!showForm) {
      setShowValidationErrors(false);
    }
  }, [showForm]);

  useEffect(() => {
    if (!showTaskForm) {
      setShowTaskValidationErrors(false);
      setShowTaskDateValidationErrors(false);
      setShowTaskBreakdownError(false);
    }
  }, [showTaskForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.workingDays.length === 0) {
      setShowValidationErrors(true);
      showAlert('Missing Information', 'Please select at least one working day to save your internship.');
      return;
    }

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const startIdx = months.indexOf(formData.startMonth);
    const endIdx = months.indexOf(formData.endMonth);
    if (startIdx !== -1 && endIdx !== -1) {
      const startDate = new Date(formData.startYear, startIdx, 1);
      const endDate = new Date(formData.endYear, endIdx, 1);
      if (startDate > endDate) {
        showAlert('Invalid Period', 'The start date cannot be after the end date.');
        return;
      }
    }

    try {
      let res;
      if (isEditingInternship && editingInternshipId) {
        res = await api.internships.update(editingInternshipId, formData);
      } else {
        res = await api.internships.create(formData);
      }

      if (res.error) {
        showAlert('Error', res.error);
        return;
      }

      setShowForm(false);
      setIsEditingInternship(false);
      setEditingInternshipId(null);
      setShowValidationErrors(false);
      setFormData({
        role: '',
        workType: 'hybrid',
        workingDays: [],
        workingHours: '09:00-17:00',
        startMonth: 'January',
        startYear: new Date().getFullYear(),
        endMonth: 'March',
        endYear: new Date().getFullYear()
      });
      fetchData();
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  const openEditInternshipModal = (intern: any) => {
    setFormData({
      role: intern.role,
      workType: intern.workType,
      workingDays: typeof intern.workingDays === 'string' ? JSON.parse(intern.workingDays) : intern.workingDays,
      workingHours: intern.workingHours,
      startMonth: intern.startMonth || 'January',
      startYear: intern.startYear || new Date().getFullYear(),
      endMonth: intern.endMonth || 'March',
      endYear: intern.endYear || new Date().getFullYear()
    });
    setEditingInternshipId(intern.id);
    setIsEditingInternship(true);
    setShowForm(true);
  };

  const handleDeleteInternship = (intern: any) => {
    setInternshipToDelete(intern);
  };

  const confirmDeleteInternship = async () => {
    if (!internshipToDelete) return;
    const intern = { ...internshipToDelete };
    try {
      const res = await api.internships.delete(intern.id);
      if (res.error) {
        showAlert('Error', `Failed to delete internship: ${res.error}`);
      } else {
        setInternshipToDelete(null);
        showUndo('Internship and related tasks successfully deleted', async () => {
          await api.internships.create({
            role: intern.role,
            workType: intern.workType,
            workingDays: typeof intern.workingDays === 'string' ? JSON.parse(intern.workingDays) : intern.workingDays,
            workingHours: intern.workingHours,
            startMonth: intern.startMonth,
            startYear: intern.startYear,
            endMonth: intern.endMonth,
            endYear: intern.endYear
          });
          fetchData();
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An error occurred while deleting the internship.');
    }
  };

  const handleDeleteTask = (task: any) => {
    setTaskToDelete(task);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    const task = { ...taskToDelete };
    try {
      const res = await api.internships.deleteTask(task.id);
      if (res.error) {
        showAlert('Error', `Failed to delete task: ${res.error}`);
      } else {
        setTaskToDelete(null);
        showUndo('Task and related items successfully deleted', async () => {
          await api.internships.createTask(task.internshipId, {
            title: task.title,
            description: task.description,
            deadline: task.deadline,
            subtasks: task.subtasks
          });
          fetchData();
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An error occurred while deleting the task.');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskFormData.description || taskFormData.description.trim().length === 0) {
      setShowTaskValidationErrors(true);
      showAlert('Missing Information', 'Task description is required to save this task.');
      return;
    }

    if (taskFormData.deadline) {
      const deadlineDate = new Date(taskFormData.deadline);
      const now = new Date();
      if (deadlineDate < now) {
        setShowTaskDateValidationErrors(true);
        showAlert('Invalid Date', 'Deadline cannot be set to a past time.');
        return;
      }

      // Frontend validation for deadline within internship period
      const internship = internships.find(i => i.id === selectedInternshipId);
      if (internship) {
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const startIdx = months.indexOf(internship.startMonth);
        const endIdx = months.indexOf(internship.endMonth);
        const startYear = internship.startYear || now.getFullYear();
        const endYear = internship.endYear || startYear;

        if (startIdx !== -1 && endIdx !== -1) {
          const startDate = new Date(startYear, startIdx, 1);
          const endDate = new Date(endYear, endIdx, 1);
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(0);
          endDate.setHours(23, 59, 59, 999);

          if (deadlineDate < startDate || deadlineDate > endDate) {
            setShowTaskDateValidationErrors(true);
            showAlert('Invalid Deadline', `Deadline must be within the internship period (${internship.startMonth} ${startYear} - ${internship.endMonth} ${endYear}).`);
            return;
          }
        }
      }
    }

    if (!taskFormData.subtasks || taskFormData.subtasks.length === 0 || taskFormData.subtasks.some(s => !s.title.trim())) {
      setShowTaskBreakdownError(true);
      showAlert('Missing Breakdown', 'A task breakdown is mandatory before saving.');
      return;
    }

    const saveTask = async (force = false) => {
      try {
        let res;
        const payload = { ...taskFormData, force };
        if (isEditingTask && editingTaskId) {
          res = await api.internships.editTask(editingTaskId, payload);
        } else if (selectedInternshipId) {
          res = await api.internships.createTask(selectedInternshipId, payload);
        }

        if (res && res.isDuplicate) {
          showWarning('Duplicate Task', res.warning, () => saveTask(true));
          return;
        }

        if (res && res.error) {
          showAlert('Error', res.error);
          return;
        }

        setShowTaskForm(false);
        setIsEditingTask(false);
        setEditingTaskId(null);
        setShowTaskValidationErrors(false);
        setTaskFormData({ title: '', description: '', deadline: '', subtasks: [] });
        fetchData();
      } catch (err) {
        console.error(err);
        showAlert('Error', 'An unexpected error occurred. Please try again.');
      }
    };

    saveTask();
  };

  const openEditTaskModal = (task: any, internshipId: number) => {
    setSelectedInternshipId(internshipId);
    setTaskFormData({
      title: task.title,
      description: task.description || '',
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '',
      subtasks: task.subtasks.map((s: any) => ({ title: s.title, status: s.status }))
    });
    setEditingTaskId(task.id);
    setIsEditingTask(true);
    setShowTaskForm(true);
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    showConfirm('Delete Subtask', 'Are you sure you want to delete this subtask?', async () => {
      try {
        const res = await api.internships.deleteSubtask(subtaskId);
        if (res.error) {
          showAlert('Error', `Failed to delete subtask: ${res.error}`);
        } else {
          fetchData();
        }
      } catch (err) {
        console.error(err);
        showAlert('Error', 'An error occurred while deleting the subtask.');
      }
    });
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

  const handleTaskAIBreakdown = async () => {
    if (!taskFormData.title || !taskFormData.deadline) {
      showAlert('Missing Information', 'Please provide a task title and deadline first.');
      return;
    }

    const internship = internships.find(i => i.id === selectedInternshipId);
    if (!internship) return;

    setGeneratingTaskAI(true);
    try {
      const subtasks = await aiService.generateInternshipTaskBreakdown(
        taskFormData.title,
        taskFormData.description,
        taskFormData.deadline,
        internship.role,
        typeof internship.workingDays === 'string' ? JSON.parse(internship.workingDays) : internship.workingDays
      );
      setTaskFormData({ ...taskFormData, subtasks });
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to generate breakdown. Please try again.');
    } finally {
      setGeneratingTaskAI(false);
    }
  };

  const toggleTaskStatus = async (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await api.internships.updateTask(taskId, newStatus);
    fetchData();
  };

  const toggleSubtaskStatus = async (subtaskId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await api.internships.updateSubtask(subtaskId, newStatus);
    fetchData();
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Internship Tracker</h1>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 w-full sm:w-auto"
        >
          <Plus size={20} />
          <span>Add Internship</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
        ) : internships.length > 0 ? (
          internships.map((intern, i) => (
            <motion.div 
              key={intern.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <Briefcase size={28} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => openEditInternshipModal(intern)}
                      className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteInternship(intern)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${
                      intern.workType === 'remote' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      intern.workType === 'hybrid' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                      {intern.workType}
                    </span>
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold text-slate-900">{intern.role}</h3>
                
                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div className="flex items-center space-x-3 text-slate-600">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                      <Clock size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hours</p>
                      <p className="font-semibold text-sm">{intern.workingHours}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</p>
                      <p className="font-semibold text-sm">
                        {intern.startMonth && intern.endMonth 
                          ? `${intern.startMonth} ${intern.startYear || ''} - ${intern.endMonth} ${intern.endYear || ''}`
                          : `${intern.periodMonths} Months`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Working Days</p>
                  <div className="flex flex-wrap gap-2">
                    {(typeof intern.workingDays === 'string' ? JSON.parse(intern.workingDays) : intern.workingDays).map((day: string) => (
                      <span key={day} className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-bold rounded-lg border border-slate-100">
                        {day}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900">Assigned Tasks</h4>
                    <button 
                      onClick={() => {
                        setSelectedInternshipId(intern.id);
                        setShowTaskForm(true);
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1 bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                    >
                      <Plus size={14} />
                      <span>Add Task</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {intern.tasks && intern.tasks.length > 0 ? (
                      intern.tasks.map((task: any) => (
                        <div key={task.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <button 
                                onClick={() => toggleTaskStatus(task.id, task.status)}
                                className={`transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-600'}`}
                              >
                                {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                              </button>
                              <h5 className={`font-bold text-slate-900 text-sm ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                                {task.title}
                              </h5>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={() => openEditTaskModal(task, intern.id)}
                                className="text-slate-300 hover:text-indigo-600 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteTask(task)}
                                className="text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                Due: {new Date(task.deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </div>
                          </div>
                          
                          {task.subtasks && task.subtasks.length > 0 && (
                            <div className="ml-8 space-y-2 mt-3 pt-3 border-t border-slate-200/50">
                              {task.subtasks.map((sub: any) => (
                                <div key={sub.id} className="flex items-center justify-between group/sub">
                                  <div className="flex items-center space-x-2">
                                    <button 
                                      onClick={() => toggleSubtaskStatus(sub.id, sub.status)}
                                      className={`transition-colors ${sub.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-600'}`}
                                    >
                                      {sub.status === 'completed' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                    </button>
                                    <span className={`text-xs text-slate-600 ${sub.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                                      {sub.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                    {sub.scheduledDate && (
                                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                        {new Date(sub.scheduledDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                    <button 
                                      onClick={() => handleDeleteSubtask(sub.id)}
                                      className="text-slate-300 hover:text-rose-500 transition-all"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No tasks assigned yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full bg-white p-16 rounded-3xl border border-dashed border-slate-200 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
              <Briefcase size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No internships added</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Track your work commitments and let UniDash balance them with your studies.</p>
          </div>
        )}
      </div>

      {/* Custom Modal */}
      <AnimatePresence>
        {modal.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
                modal.type === 'alert' ? 'bg-indigo-50 text-indigo-600' :
                modal.type === 'confirm' ? 'bg-rose-50 text-rose-600' :
                'bg-amber-50 text-amber-600'
              }`}>
                {modal.type === 'alert' ? <MessageSquare size={32} /> :
                 modal.type === 'confirm' ? <Trash2 size={32} /> :
                 <Sparkles size={32} />}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{modal.title}</h3>
              <p className="text-slate-500 text-sm mb-8">{modal.message}</p>
              <div className="flex space-x-3">
                {modal.type !== 'alert' && (
                  <button 
                    onClick={() => {
                      setModal({ ...modal, isOpen: false });
                      if (modal.onCancel) modal.onCancel();
                    }}
                    className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  onClick={() => {
                    setModal({ ...modal, isOpen: false });
                    if (modal.onConfirm) modal.onConfirm();
                  }}
                  className={`flex-1 px-4 py-3 text-white font-bold rounded-xl transition-all ${
                    modal.type === 'confirm' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {modal.type === 'alert' ? 'OK' : modal.type === 'confirm' ? 'Delete' : 'Continue'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Internship Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{isEditingInternship ? 'Edit Internship' : 'Add Internship'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Role / Position</label>
                <input 
                  type="text" 
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Software Engineer Intern"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Work Type</label>
                <select 
                  value={formData.workType}
                  onChange={(e) => setFormData({...formData, workType: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="fullTime">Full Time (On-site)</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Working Days</label>
                <div className={`flex flex-wrap gap-2 p-2 rounded-xl transition-all ${showValidationErrors && formData.workingDays.length === 0 ? 'border-2 border-rose-500 bg-rose-50' : ''}`}>
                  {days.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const newDays = formData.workingDays.includes(day)
                          ? formData.workingDays.filter(d => d !== day)
                          : [...formData.workingDays, day];
                        setFormData({...formData, workingDays: newDays});
                        if (newDays.length > 0) setShowValidationErrors(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        formData.workingDays.includes(day) 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                {showValidationErrors && formData.workingDays.length === 0 && (
                  <p className="text-rose-500 text-[10px] font-bold mt-1 ml-1">Please select at least one day</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Start Period</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      value={formData.startMonth}
                      onChange={(e) => setFormData({...formData, startMonth: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input 
                      type="number"
                      value={formData.startYear}
                      onChange={(e) => setFormData({...formData, startYear: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      min={2020}
                      max={2100}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">End Period</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      value={formData.endMonth}
                      onChange={(e) => setFormData({...formData, endMonth: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input 
                      type="number"
                      value={formData.endYear}
                      onChange={(e) => setFormData({...formData, endYear: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      min={2020}
                      max={2100}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Hours (Start-End)</label>
                <input 
                  type="text" 
                  required
                  value={formData.workingHours}
                  onChange={(e) => setFormData({...formData, workingHours: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="09:00-17:00"
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setIsEditingInternship(false);
                    setEditingInternshipId(null);
                    setShowValidationErrors(false);
                    setFormData({
                      role: '',
                      workType: 'hybrid',
                      workingDays: [],
                      workingHours: '09:00-17:00',
                      startMonth: 'January',
                      startYear: new Date().getFullYear(),
                      endMonth: 'March',
                      endYear: new Date().getFullYear()
                    });
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  {isEditingInternship ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* Task Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{isEditingTask ? 'Edit Task' : 'Assign New Task'}</h2>
              <button 
                type="button"
                onClick={handleTaskAIBreakdown}
                disabled={generatingTaskAI}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1 bg-indigo-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {generatingTaskAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{generatingTaskAI ? 'Generating...' : 'AI Breakdown'}</span>
              </button>
            </div>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Task Title</label>
                <input 
                  type="text" 
                  required
                  value={taskFormData.title}
                  onChange={(e) => setTaskFormData({...taskFormData, title: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Weekly Report"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea 
                  value={taskFormData.description}
                  onChange={(e) => {
                    setTaskFormData({...taskFormData, description: e.target.value});
                    if (e.target.value.trim().length > 0) setShowTaskValidationErrors(false);
                  }}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] transition-all ${
                    showTaskValidationErrors && (!taskFormData.description || taskFormData.description.trim().length === 0)
                      ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-500'
                      : 'border-slate-200'
                  }`}
                  placeholder="Describe what needs to be done..."
                />
                {showTaskValidationErrors && (!taskFormData.description || taskFormData.description.trim().length === 0) && (
                  <p className="text-rose-500 text-[10px] font-bold mt-1 ml-1">Task description is required to save this task.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Deadline</label>
                <input 
                  type="datetime-local" 
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  value={taskFormData.deadline}
                  onChange={(e) => {
                    setTaskFormData({...taskFormData, deadline: e.target.value});
                    const selectedDate = new Date(e.target.value);
                    const now = new Date();
                    if (selectedDate >= now) setShowTaskDateValidationErrors(false);
                  }}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                    showTaskDateValidationErrors 
                      ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-500'
                      : 'border-slate-200'
                  }`}
                />
                {showTaskDateValidationErrors && (
                  <p className="text-rose-500 text-[10px] font-bold mt-1 ml-1">Deadline cannot be set to a past time.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Subtasks (AI Generated or Manual)</label>
                <div className={`space-y-2 p-2 rounded-xl transition-all ${showTaskBreakdownError ? 'border-2 border-rose-500 bg-rose-50' : ''}`}>
                  {taskFormData.subtasks.map((sub, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input 
                        type="text"
                        value={sub.title}
                        onChange={(e) => {
                          const newSubtasks = [...taskFormData.subtasks];
                          newSubtasks[idx].title = e.target.value;
                          setTaskFormData({ ...taskFormData, subtasks: newSubtasks });
                          if (e.target.value.trim()) setShowTaskBreakdownError(false);
                        }}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          const newSubtasks = taskFormData.subtasks.filter((_, i) => i !== idx);
                          setTaskFormData({
                            ...taskFormData,
                            subtasks: newSubtasks
                          });
                          if (newSubtasks.length > 0) setShowTaskBreakdownError(false);
                        }}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    type="button"
                    onClick={() => setTaskFormData({
                      ...taskFormData,
                      subtasks: [...taskFormData.subtasks, { title: '' }]
                    })}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Add Subtask</span>
                  </button>
                </div>
                {showTaskBreakdownError && (
                  <p className="text-rose-500 text-[10px] font-bold mt-1 ml-1">A task breakdown is mandatory before saving.</p>
                )}
              </div>
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowTaskForm(false);
                    setIsEditingTask(false);
                    setEditingTaskId(null);
                    setShowTaskValidationErrors(false);
                    setShowTaskDateValidationErrors(false);
                    setTaskFormData({ title: '', description: '', deadline: '', subtasks: [] });
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  {isEditingTask ? 'Update Task' : 'Assign Task'}
                </button>
              </div>
            </form>
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

      {/* Internship Delete Confirmation Modal */}
      {internshipToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Internship?</h2>
            <p className="text-slate-500 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700">{internshipToDelete.role}</span>"? This will remove all associated tasks from your schedule.</p>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setInternshipToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteInternship}
                className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Task Delete Confirmation Modal */}
      {taskToDelete && (
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
            <p className="text-slate-500 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700">{taskToDelete.title}</span>"? This will remove it from your schedule.</p>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setTaskToDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteTask}
                className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Internship;
