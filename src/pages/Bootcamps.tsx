import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Zap, Calendar, Clock, Loader2, Edit2, Trash2, RotateCcw, X, ArrowLeft } from 'lucide-react';

const Bootcamps = () => {
  const navigate = useNavigate();
  const [bootcamps, setBootcamps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBootcamp, setEditingBootcamp] = useState<any>(null);
  const [bootcampToDelete, setBootcampToDelete] = useState<any>(null);
  const [undoAction, setUndoAction] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'self',
    startMonth: 'January',
    startYear: new Date().getFullYear(),
    endMonth: 'March',
    endYear: new Date().getFullYear(),
    classDaysConfig: [] as { day: string; time: string; duration: number }[]
  });
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.bootcamps.getAll();
      setBootcamps(data);
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
    
    if (formData.endYear < formData.startYear) {
      alert('End year cannot be earlier than start year.');
      return;
    }

    if (formData.startYear === formData.endYear) {
      const startIdx = months.indexOf(formData.startMonth);
      const endIdx = months.indexOf(formData.endMonth);
      if (endIdx < startIdx) {
        alert('End month cannot be earlier than start month for the same year.');
        return;
      }
    }

    if (formData.classDaysConfig.length === 0) {
      alert('Please select at least one day for the bootcamp schedule.');
      return;
    }
    
    // Prepare data for API
    const apiData = {
      ...formData,
      classDays: formData.classDaysConfig.map(c => ({
        day: c.day,
        time: c.time,
        duration: c.duration
      })),
      sessions: []
    };

    try {
      if (editingBootcamp) {
        await api.bootcamps.update(editingBootcamp.id, apiData);
      } else {
        await api.bootcamps.create(apiData);
      }
      setShowForm(false);
      setEditingBootcamp(null);
      setFormData({
        name: '',
        type: 'self',
        startMonth: 'January',
        startYear: new Date().getFullYear(),
        endMonth: 'March',
        endYear: new Date().getFullYear(),
        classDaysConfig: []
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(err.error || 'Failed to save bootcamp. Please try again.');
    }
  };

  const handleEdit = (bc: any) => {
    setEditingBootcamp(bc);
    
    let classDaysConfig = [];
    if (bc.classDays) {
      try {
        const parsed = typeof bc.classDays === 'string' ? JSON.parse(bc.classDays) : bc.classDays;
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
          classDaysConfig = parsed.map((c: any) => ({
            day: c.day,
            time: c.time,
            duration: c.duration || 60
          }));
        } else if (Array.isArray(parsed)) {
          // Legacy format
          classDaysConfig = parsed.map((day: string) => ({
            day,
            time: bc.classTime || '18:00',
            duration: bc.duration || 60
          }));
        }
      } catch (e) {
        console.error('Failed to parse classDays', e);
      }
    }

    setFormData({
      name: bc.name,
      type: bc.type || 'self',
      startMonth: bc.startMonth || 'January',
      startYear: bc.startYear || new Date().getFullYear(),
      endMonth: bc.endMonth || 'March',
      endYear: bc.endYear || new Date().getFullYear(),
      classDaysConfig
    });
    setShowForm(true);
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

  const handleDelete = (bc: any) => {
    setBootcampToDelete(bc);
  };

  const confirmDelete = async () => {
    if (!bootcampToDelete) return;
    const bc = { ...bootcampToDelete };
    const id = bc.id;
    
    try {
      // Optimistic update
      setBootcamps(prev => prev.filter(b => b.id !== id));
      setBootcampToDelete(null);
      
      await api.bootcamps.delete(id);
      
      showUndo(`${bc.name} deleted`, async () => {
        const apiData = {
          name: bc.name,
          type: bc.type,
          period: bc.period,
          startMonth: bc.startMonth,
          startYear: bc.startYear,
          endMonth: bc.endMonth,
          endYear: bc.endYear,
          classDays: bc.classDays,
          classTime: bc.classTime,
          duration: bc.duration,
          sessions: []
        };
        await api.bootcamps.create(apiData);
        fetchData();
      });

      fetchData();
    } catch (err) {
      console.error('Failed to delete bootcamp:', err);
      fetchData();
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Bootcamps & Courses</h1>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 w-full sm:w-auto"
        >
          <Plus size={20} />
          <span>Add Bootcamp</span>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
        ) : bootcamps.length > 0 ? (
          bootcamps.map((bc, i) => (
            <motion.div 
              key={bc.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                  <Zap size={24} />
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleEdit(bc)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(bc)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    bc.type === 'guided' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {bc.type === 'guided' ? 'Guided' : 'Self-Guided'}
                  </span>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-2">{bc.name}</h3>
              <p className="text-sm text-slate-500 mb-6">
                {bc.startMonth && bc.endMonth 
                  ? `start month ${bc.startMonth.toLowerCase()} ${bc.startYear || ''} for end month ${bc.endMonth.toLowerCase()} ${bc.endYear || ''}`
                  : bc.period || 'No period set'}
              </p>

              {bc.classDays && (
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
                  <div className="space-y-2">
                    {(() => {
                      try {
                        const parsed = typeof bc.classDays === 'string' ? JSON.parse(bc.classDays) : bc.classDays;
                        if (Array.isArray(parsed) && typeof parsed[0] === 'object') {
                          return parsed.map((config: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-lg">
                              <span className="font-bold text-indigo-600">{config.day.slice(0, 3)}</span>
                              <div className="flex items-center space-x-2">
                                <Clock size={12} className="text-indigo-400" />
                                <span>{config.time} ({config.duration}m)</span>
                              </div>
                            </div>
                          ));
                        } else if (Array.isArray(parsed)) {
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {parsed.map((day: string) => (
                                <span key={day} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                  {day.slice(0, 3)}
                                </span>
                              ))}
                            </div>
                          );
                        }
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          ))
        ) : (
          <div className="col-span-full bg-white p-16 rounded-3xl border border-dashed border-slate-200 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
              <Zap size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No bootcamps yet</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Add your self-paced or guided bootcamps to stay on top of your learning goals.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {bootcampToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Bootcamp?</h2>
            <p className="text-slate-500 mb-6">Are you sure you want to delete "<span className="font-semibold text-slate-700">{bootcampToDelete.name}</span>"? This will remove it from your schedule.</p>
            
            <div className="flex space-x-3">
              <button 
                onClick={() => setBootcampToDelete(null)}
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

      {/* Bootcamp Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{editingBootcamp ? 'Edit Bootcamp' : 'Add Bootcamp'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Full Stack Web Dev"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
                <div className="flex space-x-4">
                  {[
                    { id: 'self', label: 'Self-Guided' },
                    { id: 'guided', label: 'Guided' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({...formData, type: t.id})}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all text-xs ${
                        formData.type === t.id 
                          ? 'bg-indigo-50 border-indigo-600 text-indigo-700' 
                          : 'bg-slate-50 border-transparent text-slate-500'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Start Month</label>
                      <select 
                        value={formData.startMonth}
                        onChange={(e) => setFormData({...formData, startMonth: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Start Year</label>
                      <select 
                        value={formData.startYear}
                        onChange={(e) => setFormData({...formData, startYear: parseInt(e.target.value)})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">End Month</label>
                      <select 
                        value={formData.endMonth}
                        onChange={(e) => setFormData({...formData, endMonth: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">End Year</label>
                      <select 
                        value={formData.endYear}
                        onChange={(e) => setFormData({...formData, endYear: parseInt(e.target.value)})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4">
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center space-x-2">
                  <Zap size={14} />
                  <span>Bootcamp Schedule</span>
                </p>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Select Days</label>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {days.map(day => {
                      const isSelected = formData.classDaysConfig.some(c => c.day === day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const newConfigs = isSelected
                              ? formData.classDaysConfig.filter(c => c.day !== day)
                              : [...formData.classDaysConfig, { day, time: '18:00', duration: 60 }];
                            setFormData({ ...formData, classDaysConfig: newConfigs });
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>

                  {formData.classDaysConfig.length > 0 && (
                    <div className="space-y-3 bg-white/50 p-3 rounded-xl border border-indigo-100/50">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Day Settings</p>
                      {formData.classDaysConfig.map((config, idx) => (
                        <div key={config.day} className="space-y-2 pb-2 border-b border-indigo-50 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-600">{config.day}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">Time</label>
                              <input 
                                type="time" 
                                value={config.time}
                                onChange={(e) => {
                                  const newConfigs = [...formData.classDaysConfig];
                                  newConfigs[idx].time = e.target.value;
                                  setFormData({ ...formData, classDaysConfig: newConfigs });
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">Duration</label>
                              <div className="flex items-center space-x-1">
                                <div className="flex-1 relative">
                                  <input 
                                    type="number" 
                                    min="0"
                                    value={Math.floor(config.duration / 60)}
                                    onChange={(e) => {
                                      const h = Math.max(0, parseInt(e.target.value) || 0);
                                      const m = config.duration % 60;
                                      const newConfigs = [...formData.classDaysConfig];
                                      newConfigs[idx].duration = h * 60 + m;
                                      setFormData({ ...formData, classDaysConfig: newConfigs });
                                    }}
                                    className="w-full pl-2 pr-5 py-1 bg-white border border-slate-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-400">h</span>
                                </div>
                                <div className="flex-1 relative">
                                  <input 
                                    type="number" 
                                    min="0"
                                    max="59"
                                    value={config.duration % 60}
                                    onChange={(e) => {
                                      const m = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                      const h = Math.floor(config.duration / 60);
                                      const newConfigs = [...formData.classDaysConfig];
                                      newConfigs[idx].duration = h * 60 + m;
                                      setFormData({ ...formData, classDaysConfig: newConfigs });
                                    }}
                                    className="w-full pl-2 pr-5 py-1 bg-white border border-slate-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-400">m</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingBootcamp(null);
                    setFormData({
                      name: '',
                      type: 'self',
                      startMonth: 'January',
                      startYear: new Date().getFullYear(),
                      endMonth: 'March',
                      endYear: new Date().getFullYear(),
                      classDaysConfig: []
                    });
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={formData.classDaysConfig.length === 0}
                  className={`flex-1 px-4 py-3 font-bold rounded-xl transition-all ${
                    formData.classDaysConfig.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100'
                  }`}
                >
                  {editingBootcamp ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Bootcamps;
