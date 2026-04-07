import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mail, 
  Brain, 
  Clock, 
  Zap, 
  Target, 
  Edit3, 
  Save, 
  X, 
  CheckCircle2,
  ChevronRight,
  Bell,
  ArrowLeft
} from 'lucide-react';

const Profile = () => {
  const { user, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    concentrationDuration: user?.concentrationProfile?.concentrationDuration || 60,
    workloadTolerance: user?.concentrationProfile?.workloadTolerance || 'medium',
    preferredStudyHours: user?.concentrationProfile?.preferredStudyHours || [8, 22],
    notificationLeadTime: user?.concentrationProfile?.notificationLeadTime || 15
  });

  const handleEdit = () => {
    setFormData({
      concentrationDuration: user?.concentrationProfile?.concentrationDuration || 60,
      workloadTolerance: user?.concentrationProfile?.workloadTolerance || 'medium',
      preferredStudyHours: user?.concentrationProfile?.preferredStudyHours || [8, 22],
      notificationLeadTime: user?.concentrationProfile?.notificationLeadTime || 15
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.auth.onboarding({ concentrationProfile: formData });
      await refreshUser();
      setMessage({ type: 'success', text: 'Focus Profile updated successfully!' });
      setIsEditing(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const workloadOptions = [
    { label: 'Light', value: 'low', desc: 'Focus on quality over quantity' },
    { label: 'Moderate', value: 'medium', desc: 'Balanced approach' },
    { label: 'High', value: 'high', desc: 'Power through heavy workloads' }
  ];

  const studyHourOptions = [
    { label: 'Early Morning', value: [6, 12], time: '6 AM - 12 PM' },
    { label: 'Afternoon', value: [12, 18], time: '12 PM - 6 PM' },
    { label: 'Evening', value: [18, 24], time: '6 PM - 12 AM' },
    { label: 'Late Night', value: [0, 6], time: '12 AM - 6 AM' }
  ];

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <Link 
        to="/" 
        className="group flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition-colors"
      >
        <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-all">
          <ArrowLeft size={20} />
        </div>
        <span className="font-bold text-sm tracking-tight">Back to Dashboard</span>
      </Link>

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">User Profile</h1>
          <p className="text-slate-500 mt-2 text-lg">Manage your personal information and productivity preferences.</p>
        </div>
        <AnimatePresence>
          {message && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
              <span>{message.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personal Info */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-32 bg-gradient-to-br from-indigo-600 to-violet-700" />
            <div className="px-6 pb-8 -mt-12">
              <div className="relative inline-block">
                <div className="w-24 h-24 bg-white rounded-2xl shadow-xl flex items-center justify-center text-indigo-600 border-4 border-white">
                  <User size={48} strokeWidth={1.5} />
                </div>
              </div>
              
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
                  <p className="text-slate-500 font-medium">{user.course || 'Student'}</p>
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex items-center space-x-3 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <Mail size={18} />
                    </div>
                    <span className="text-sm font-medium">{user.email}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <Target size={18} />
                    </div>
                    <span className="text-sm font-medium">Year {user.yearOfStudy}, {user.semesterType}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="font-bold text-lg mb-2">Academic Status</h3>
              <p className="text-slate-400 text-sm mb-4">Your current progress for the {user.semesterType} semester.</p>
              <div className="space-y-4">
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    <span>Semester Window</span>
                  </div>
                  <p className="text-sm font-medium">
                    {user.semesterStartMonth} — {user.semesterEndMonth}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl" />
          </section>

          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Zap size={20} />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">Daily Streak</h3>
            </div>
            <div className="flex items-end space-x-2">
              <span className="text-4xl font-black text-slate-900">{user.streak || 0}</span>
              <span className="text-slate-400 font-bold mb-1">days</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Keep completing your daily tasks to grow your streak!</p>
          </section>
        </div>

        {/* Right Column: Focus Profile */}
        <div className="lg:col-span-2">
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden h-full">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Brain size={24} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Focus Profile</h2>
              </div>
              {!isEditing ? (
                <button 
                  onClick={handleEdit}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl font-bold text-sm transition-all"
                >
                  <Edit3 size={16} />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center space-x-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-100"
                  >
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                    <span>Save Changes</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-8">
              <AnimatePresence mode="wait">
                {!isEditing ? (
                  <motion.div 
                    key="view"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-8"
                  >
                    <div className="space-y-6">
                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center space-x-3 text-indigo-600 mb-4">
                          <Clock size={20} />
                          <h3 className="font-bold">Concentration Span</h3>
                        </div>
                        <p className="text-3xl font-black text-slate-900">{user.concentrationProfile?.concentrationDuration || 60} <span className="text-lg font-bold text-slate-400">min</span></p>
                        <p className="text-sm text-slate-500 mt-2">Maximum duration for deep focus sessions.</p>
                      </div>

                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center space-x-3 text-indigo-600 mb-4">
                          <Target size={20} />
                          <h3 className="font-bold">Workload Tolerance</h3>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl font-black text-slate-900 capitalize">{user.concentrationProfile?.workloadTolerance || 'Medium'}</span>
                          <div className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            user.concentrationProfile?.workloadTolerance === 'high' ? 'bg-rose-100 text-rose-600' :
                            user.concentrationProfile?.workloadTolerance === 'medium' ? 'bg-indigo-100 text-indigo-600' :
                            'bg-emerald-100 text-emerald-600'
                          }`}>
                            {user.concentrationProfile?.workloadTolerance || 'Medium'}
                          </div>
                        </div>
                        <p className="text-sm text-slate-500 mt-2">How much pressure you prefer in your schedule.</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center space-x-3 text-indigo-600 mb-4">
                          <Zap size={20} />
                          <h3 className="font-bold">Peak Productivity</h3>
                        </div>
                        <p className="text-xl font-bold text-slate-900">
                          {studyHourOptions.find(o => 
                            o.value[0] === user.concentrationProfile?.preferredStudyHours?.[0] && 
                            o.value[1] === user.concentrationProfile?.preferredStudyHours?.[1]
                          )?.label || 'Custom Period'}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          {user.concentrationProfile?.preferredStudyHours?.[0]}:00 — {user.concentrationProfile?.preferredStudyHours?.[1]}:00
                        </p>
                      </div>

                      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center space-x-3 text-indigo-600 mb-4">
                          <Bell size={20} />
                          <h3 className="font-bold">Notification Lead Time</h3>
                        </div>
                        <p className="text-3xl font-black text-slate-900">{user.concentrationProfile?.notificationLeadTime || 15} <span className="text-lg font-bold text-slate-400">min</span></p>
                        <p className="text-sm text-slate-500 mt-2">Advance notice for classes and tasks.</p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="edit"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    {/* Concentration Duration */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Concentration Duration (Minutes)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[30, 60, 90, 120].map((val) => (
                          <button
                            key={val}
                            onClick={() => setFormData({ ...formData, concentrationDuration: val })}
                            className={`p-4 rounded-2xl border-2 font-bold transition-all ${
                              formData.concentrationDuration === val 
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                                : 'border-slate-100 text-slate-500 hover:border-indigo-200'
                            }`}
                          >
                            {val}m
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Workload Tolerance */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Workload Tolerance</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {workloadOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setFormData({ ...formData, workloadTolerance: opt.value })}
                            className={`p-5 rounded-2xl border-2 text-left transition-all ${
                              formData.workloadTolerance === opt.value 
                                ? 'border-indigo-600 bg-indigo-50' 
                                : 'border-slate-100 hover:border-indigo-200'
                            }`}
                          >
                            <p className={`font-bold ${formData.workloadTolerance === opt.value ? 'text-indigo-600' : 'text-slate-700'}`}>{opt.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preferred Study Hours */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Peak Productivity Hours</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {studyHourOptions.map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => setFormData({ ...formData, preferredStudyHours: opt.value })}
                            className={`p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                              formData.preferredStudyHours[0] === opt.value[0] && formData.preferredStudyHours[1] === opt.value[1]
                                ? 'border-indigo-600 bg-indigo-50' 
                                : 'border-slate-100 hover:border-indigo-200'
                            }`}
                          >
                            <div>
                              <p className={`font-bold ${formData.preferredStudyHours[0] === opt.value[0] ? 'text-indigo-600' : 'text-slate-700'}`}>{opt.label}</p>
                              <p className="text-xs text-slate-500 mt-1">{opt.time}</p>
                            </div>
                            {formData.preferredStudyHours[0] === opt.value[0] && <CheckCircle2 size={20} className="text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notification Lead Time */}
                    <div className="space-y-4">
                      <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Notification Lead Time (Minutes)</label>
                      <div className="flex items-center space-x-4">
                        <input 
                          type="range" 
                          min="5" 
                          max="120" 
                          step="5"
                          value={formData.notificationLeadTime}
                          onChange={(e) => setFormData({ ...formData, notificationLeadTime: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="w-16 text-center p-2 bg-indigo-50 rounded-xl font-bold text-indigo-600">
                          {formData.notificationLeadTime}m
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;
