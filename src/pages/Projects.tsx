import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, FolderKanban, Calendar, Clock, CheckCircle2, Circle, Loader2, Sparkles, ArrowLeft, Edit2, Trash2, RotateCcw, X, MessageSquare } from 'lucide-react';
import { aiService } from '../services/aiService';

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
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

  const showWarning = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setModal({ isOpen: true, title, message, onConfirm, onCancel, type: 'warning' });
  };

  const [formData, setFormData] = useState({
    projectName: '',
    description: '',
    deadline: '',
    tasks: [{ title: '', duration: 60 }]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.projects.getAll();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTask = () => {
    setFormData({
      ...formData,
      tasks: [...formData.tasks, { title: '', duration: 60 }]
    });
  };

  const handleRemoveTask = (index: number) => {
    setFormData({
      ...formData,
      tasks: formData.tasks.filter((_, i) => i !== index)
    });
  };

  const handleTaskChange = (index: number, field: string, value: any) => {
    const newTasks = [...formData.tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setFormData({ ...formData, tasks: newTasks });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.projectName || !formData.description || !formData.deadline) {
      setShowValidationErrors(true);
      showAlert('Missing Information', 'Project name, description, and deadline are required.');
      return;
    }

    if (formData.tasks.length === 0 || formData.tasks.some(t => !t.title.trim())) {
      showAlert('Missing Breakdown', 'A project breakdown is mandatory before saving.');
      return;
    }

    const saveProject = async (ignoreDuplicate = false) => {
      try {
        let res;
        const payload = { ...formData, ignoreDuplicate };
        if (editingProject) {
          const oldProject = { ...editingProject };
          res = await api.projects.update(editingProject.id, payload);
          if (res.error) {
            showAlert('Error', res.error);
            return;
          }
          showUndo('Project updated', async () => {
            await api.projects.update(oldProject.id, {
              projectName: oldProject.projectName,
              description: oldProject.description,
              deadline: oldProject.deadline,
              tasks: oldProject.tasks.map((t: any) => ({
                title: t.title,
                duration: t.estimatedDuration
              })),
              ignoreDuplicate: true
            });
            fetchData();
          });
        } else {
          res = await api.projects.create(payload);
          if (res.error) {
            showAlert('Error', res.error);
            return;
          }
        }
        setShowForm(false);
        setEditingProject(null);
        setFormData({ projectName: '', description: '', deadline: '', tasks: [{ title: '', duration: 60 }] });
        setShowValidationErrors(false);
        fetchData();
      } catch (err) {
        console.error(err);
        showAlert('Error', 'An unexpected error occurred. Please try again.');
      }
    };

    const isDuplicate = projects.some(p => 
      p.id !== editingProject?.id && 
      p.projectName.trim().toLowerCase() === formData.projectName.trim().toLowerCase() &&
      p.description.trim().toLowerCase() === formData.description.trim().toLowerCase()
    );

    if (isDuplicate) {
      showWarning(
        'Similar Project Exists',
        'A similar project already exists. Do you want to continue?',
        () => saveProject(true),
        async () => {
          if (editingProject) {
            // If editing an existing project and user rejects duplication, remove the project
            try {
              await api.projects.delete(editingProject.id);
              fetchData();
            } catch (err) {
              console.error('Failed to delete project on duplicate rejection:', err);
            }
          }
          // Reset form and close
          setShowForm(false);
          setEditingProject(null);
          setFormData({ projectName: '', description: '', deadline: '', tasks: [{ title: '', duration: 60 }] });
          setShowValidationErrors(false);
        }
      );
    } else {
      await saveProject();
    }
  };

  const handleEdit = (project: any) => {
    setEditingProject(project);
    setFormData({
      projectName: project.projectName,
      description: project.description,
      deadline: project.deadline ? new Date(project.deadline).toISOString().slice(0, 16) : '',
      tasks: project.tasks.map((t: any) => ({
        title: t.title,
        duration: t.estimatedDuration
      }))
    });
    setShowForm(true);
  };

  const toggleTask = async (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    await api.projects.updateTask(taskId, newStatus);
    
    showUndo(`Task marked as ${newStatus}`, async () => {
      await api.projects.updateTask(taskId, currentStatus);
      fetchData();
    });

    fetchData();
  };

  const handleDelete = (project: any) => {
    setProjectToDelete(project);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    const project = { ...projectToDelete };
    await api.projects.delete(project.id);
    setProjectToDelete(null);
    
    showUndo('Project deleted', async () => {
      await api.projects.create({
        projectName: project.projectName,
        description: project.description,
        deadline: project.deadline,
        tasks: project.tasks.map((t: any) => ({
          title: t.title,
          duration: t.estimatedDuration
        }))
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

  const handleAIGenerate = async () => {
    if (!formData.projectName || !formData.description) {
      showAlert('Missing Information', 'Please provide a project name and description first.');
      return;
    }

    setGeneratingAI(true);
    try {
      const tasks = await aiService.generateProjectTasks(formData.projectName, formData.description);
      setFormData({ ...formData, tasks });
    } catch (err) {
      console.error(err);
      showAlert('AI Error', 'Failed to generate tasks with AI. Please try again.');
    } finally {
      setGeneratingAI(false);
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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Project Management</h1>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 w-full sm:w-auto"
        >
          <Plus size={20} />
          <span>New Project</span>
        </button>
      </div>

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
        ) : projects.length > 0 ? (
          projects.map((project, i) => (
            <motion.div 
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <FolderKanban size={24} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => handleEdit(project)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(project)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-50 text-amber-600 px-3 py-1 rounded-full border border-amber-100">
                        Deadline: {new Date(project.deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{project.projectName}</h3>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed line-clamp-2">{project.description}</p>
              </div>

              <div className="p-8 bg-slate-50/50">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Sub-tasks</h4>
                <div className="space-y-3">
                  {project.tasks.map((task: any) => (
                    <div 
                      key={task.id}
                      className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm group"
                    >
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={() => toggleTask(task.id, task.status)}
                          className={`transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-600'}`}
                        >
                          {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                        <span className={`font-semibold text-slate-700 ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                          {task.title}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                        {task.estimatedDuration}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full bg-white p-16 rounded-3xl border border-dashed border-slate-200 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
              <FolderKanban size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No projects yet</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Create your first project and we'll help you break it down into manageable tasks.</p>
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

      {/* Project Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{editingProject ? 'Edit Project' : 'Create New Project'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.projectName}
                    onChange={(e) => setFormData({...formData, projectName: e.target.value})}
                    className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 ${showValidationErrors && !formData.projectName ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200'}`}
                    placeholder="e.g. Final Year Thesis"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                  <textarea 
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] ${showValidationErrors && !formData.description ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200'}`}
                    placeholder="Briefly describe the project goals..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Deadline</label>
                  <input 
                    type="datetime-local" 
                    required
                    min={new Date().toISOString().slice(0, 16)}
                    value={formData.deadline}
                    onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                    className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 ${showValidationErrors && !formData.deadline ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200'}`}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Tasks Breakdown</label>
                  <div className="flex items-center space-x-3">
                    <button 
                      type="button"
                      onClick={handleAIGenerate}
                      disabled={generatingAI}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1 bg-indigo-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {generatingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      <span>{generatingAI ? 'Generating...' : 'AI Breakdown'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleAddTask}
                      className="text-xs font-bold text-slate-600 hover:text-slate-700 flex items-center space-x-1 bg-slate-100 px-2 py-1 rounded-lg transition-colors"
                    >
                      <Plus size={14} />
                      <span>Add Task</span>
                    </button>
                  </div>
                </div>
                
                {formData.tasks.map((task, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <input 
                      type="text" 
                      required
                      value={task.title}
                      onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="Task title"
                    />
                    <div className="w-24 relative">
                      <input 
                        type="number" 
                        required
                        value={isNaN(task.duration) ? '' : task.duration}
                        onChange={(e) => handleTaskChange(index, 'duration', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm pr-8"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">min</span>
                    </div>
                    {formData.tasks.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => handleRemoveTask(index)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingProject(null);
                    setFormData({ projectName: '', description: '', deadline: '', tasks: [{ title: '', duration: 60 }] });
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  {editingProject ? 'Update Project' : 'Create Project'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Project?</h2>
            <p className="text-slate-500 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700">{projectToDelete.projectName}</span>"? This will remove all associated tasks from your schedule.</p>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setProjectToDelete(null)}
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
    </div>
  );
};

export default Projects;
