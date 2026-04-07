import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Shield, Save, CheckCircle2, AlertCircle, Trash2, X, Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const Settings = () => {
  const { user, refreshUser, logout } = useAuth();
  const { permission, requestPermission, showNotification, error: notificationError, isSupported } = useNotifications();
  const [leadTime, setLeadTime] = useState(user?.concentrationProfile?.notificationLeadTime || 15);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  const getPasswordStrength = (password: string) => {
    if (!password) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

    switch (score) {
      case 0:
      case 1: return { score, label: 'Very Weak', color: 'bg-rose-500' };
      case 2: return { score, label: 'Weak', color: 'bg-orange-500' };
      case 3: return { score, label: 'Fair', color: 'bg-amber-500' };
      case 4: return { score, label: 'Good', color: 'bg-emerald-400' };
      case 5: return { score, label: 'Strong', color: 'bg-emerald-600' };
      default: return { score, label: '', color: 'bg-slate-200' };
    }
  };

  const strength = getPasswordStrength(newPassword);

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateError('');
    setUpdateSuccess('');

    if (newPassword) {
      const strength = getPasswordStrength(newPassword);
      if (strength.score < 5) {
        setUpdateError('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.');
        return;
      }
    }

    if (newPassword && newPassword !== confirmPassword) {
      setUpdateError('Passwords do not match');
      return;
    }

    setUpdateLoading(true);
    try {
      const data: any = {};
      if (newName !== user?.name) data.name = newName;
      if (newEmail !== user?.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
          setUpdateError('Please enter a valid email address');
          setUpdateLoading(false);
          return;
        }
        data.email = newEmail;
      }
      if (newPassword) data.password = newPassword;

      if (Object.keys(data).length === 0) {
        setUpdateError('No changes detected');
        setUpdateLoading(false);
        return;
      }

      const res = await api.auth.updateAccount(data);
      if (res.error) {
        setUpdateError(res.error);
      } else {
        setUpdateSuccess('Account updated successfully');
        await refreshUser();
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      console.error(err);
      setUpdateError('Failed to update account');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleTestNotification = () => {
    showNotification('Test Notification', 'This is a test notification from UniDash! Your settings are working correctly.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newProfile = {
        ...user.concentrationProfile,
        notificationLeadTime: leadTime
      };
      await api.auth.onboarding({ concentrationProfile: newProfile });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await api.auth.deleteAccount();
      if (res.error) {
        alert(res.error);
      } else {
        logout();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link 
        to="/" 
        className="group flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition-colors"
      >
        <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-all">
          <ArrowLeft size={20} />
        </div>
        <span className="font-bold text-sm tracking-tight">Back to Dashboard</span>
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-2">Manage your preferences and notification settings.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Notifications Section */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Bell size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Browser Notifications</h3>
                <p className="text-sm text-slate-500">Enable alerts for upcoming tasks and classes.</p>
              </div>
              <div className="flex items-center space-x-3">
                {permission === 'granted' && (
                  <button 
                    onClick={handleTestNotification}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                  >
                    Send Test
                  </button>
                )}
                {permission === 'granted' ? (
                  <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl font-bold text-sm">
                    <CheckCircle2 size={18} />
                    <span>Enabled</span>
                  </div>
                ) : !isSupported ? (
                  <div className="flex items-center space-x-2 text-rose-600 bg-rose-50 px-4 py-2 rounded-xl font-bold text-sm">
                    <AlertCircle size={18} />
                    <span>Not Supported</span>
                  </div>
                ) : (
                  <button 
                    onClick={requestPermission}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all"
                  >
                    Enable Notifications
                  </button>
                )}
              </div>
            </div>

            {notificationError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start space-x-3 text-rose-600">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{notificationError}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Notification Lead Time</h3>
                <p className="text-sm text-slate-500">How many minutes before an activity should we notify you?</p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[5, 15, 30, 60].map((time) => (
                  <button
                    key={time}
                    onClick={() => setLeadTime(time)}
                    className={`p-4 rounded-2xl border-2 font-bold transition-all ${
                      leadTime === time 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                        : 'border-slate-100 text-slate-500 hover:border-indigo-200'
                    }`}
                  >
                    {time < 60 ? `${time}m` : '1h'}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Custom Minutes</label>
                  <input 
                    type="number" 
                    value={leadTime}
                    onChange={(e) => setLeadTime(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center space-x-3">
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <Shield size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Account & Security</h2>
          </div>
          <div className="p-8 space-y-8">
            {/* Update Profile Info */}
            <form onSubmit={handleUpdateAccount} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Full Name</label>
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                    placeholder="Your Name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Email Address</label>
                  <input 
                    type="email" 
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                    placeholder="your@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                      placeholder="Leave blank to keep current"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                        <span className="text-slate-400">Strength:</span>
                        <span className={strength.color.replace('bg-', 'text-')}>{strength.label}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(strength.score / 5) * 100}%` }}
                          className={`h-full ${strength.color} transition-all duration-500`}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Must be at least 8 chars with uppercase, lowercase, number, and symbol.
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {updateError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center space-x-3 text-rose-600">
                  <AlertCircle size={18} />
                  <p className="text-sm font-medium">{updateError}</p>
                </div>
              )}

              {updateSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center space-x-3 text-emerald-600">
                  <CheckCircle2 size={18} />
                  <p className="text-sm font-medium">{updateSuccess}</p>
                </div>
              )}

              <div className="flex justify-start">
                <button 
                  type="submit"
                  disabled={updateLoading}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center space-x-2"
                >
                  {updateLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}
                  <span>Update Account</span>
                </button>
              </div>
            </form>

            <div className="h-px bg-slate-100" />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Delete Account</h3>
                <p className="text-sm text-slate-500">Permanently remove your account and all associated data. This action cannot be undone.</p>
              </div>
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-2 px-6 py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-2xl font-bold text-sm transition-all"
              >
                <Trash2 size={18} />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end pt-4">
        <button 
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center space-x-2 px-8 py-4 rounded-2xl font-bold transition-all shadow-lg ${
            saved 
              ? 'bg-emerald-500 text-white shadow-emerald-100' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
          }`}
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={20} />
          ) : (
            <Save size={20} />
          )}
          <span>{saved ? 'Saved Successfully' : 'Save Changes'}</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                    <AlertCircle size={24} />
                  </div>
                  <button 
                    onClick={() => setShowDeleteConfirm(false)}
                    className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>
                
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Delete Account?</h3>
                <p className="text-slate-500 leading-relaxed">
                  Are you sure you want to delete your account? This will permanently remove all your units, projects, tasks, and schedule data. <strong>This action cannot be undone.</strong>
                </p>
              </div>
              
              <div className="p-8 bg-slate-50 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center justify-center space-x-2"
                >
                  {deleting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  <span>{deleting ? 'Deleting...' : 'Yes, Delete'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Settings;
