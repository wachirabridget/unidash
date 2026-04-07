import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Zap, Brain, Target, ArrowRight, ArrowLeft } from 'lucide-react';

const questions = [
  {
    id: 'preferredStudyHours',
    title: 'When are you most productive?',
    options: [
      { label: 'Early Morning (6 AM - 12 PM)', value: [6, 12] },
      { label: 'Afternoon (12 PM - 6 PM)', value: [12, 18] },
      { label: 'Evening (6 PM - 12 AM)', value: [18, 24] },
      { label: 'Late Night (12 AM - 6 AM)', value: [0, 6] }
    ],
    icon: Clock
  },
  {
    id: 'concentrationDuration',
    title: 'How long can you focus deeply?',
    options: [
      { label: '25-30 minutes (Pomodoro)', value: 30 },
      { label: '45-60 minutes', value: 60 },
      { label: '90 minutes', value: 90 },
      { label: '2+ hours', value: 120 }
    ],
    icon: Brain
  },
  {
    id: 'workloadTolerance',
    title: 'What is your workload tolerance?',
    options: [
      { label: 'Light (Focus on quality)', value: 'low' },
      { label: 'Moderate (Balanced)', value: 'medium' },
      { label: 'High (Power through)', value: 'high' }
    ],
    icon: Target
  },
  {
    id: 'notificationLeadTime',
    title: 'When should we notify you?',
    options: [
      { label: '5 minutes before', value: 5 },
      { label: '15 minutes before', value: 15 },
      { label: '30 minutes before', value: 30 },
      { label: '1 hour before', value: 60 },
      { label: 'Custom time...', value: 'custom' }
    ],
    icon: Zap
  }
];

const Onboarding = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<any>({});
  const [customValue, setCustomValue] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleSelect = (value: any) => {
    if (value === 'custom') {
      setShowCustom(true);
      return;
    }
    
    const newAnswers = { ...answers, [questions[step].id]: value };
    setAnswers(newAnswers);
    
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding(newAnswers);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customValue);
    if (isNaN(val) || val <= 0) return;
    
    setShowCustom(false);
    handleSelect(val);
  };

  const completeOnboarding = async (finalAnswers: any) => {
    try {
      await api.auth.onboarding({ concentrationProfile: finalAnswers });
      await refreshUser();
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  const currentQuestion = questions[step];
  const Icon = currentQuestion.icon;

  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <div className="mb-8 flex justify-between items-center text-indigo-100">
          <span className="text-sm font-bold uppercase tracking-widest">Step {step + 1} of {questions.length}</span>
          <div className="flex space-x-1">
            {questions.map((_, i) => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-all ${i <= step ? 'bg-white' : 'bg-indigo-400'}`} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div 
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-3xl shadow-2xl p-8 md:p-12"
          >
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
              <Icon size={32} />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-8 tracking-tight">{currentQuestion.title}</h2>
            
            {showCustom ? (
              <form onSubmit={handleCustomSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Minutes Before</label>
                  <input 
                    type="number" 
                    autoFocus
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full p-6 rounded-2xl border-2 border-indigo-100 bg-indigo-50 text-2xl font-bold text-indigo-600 outline-none focus:border-indigo-600 transition-all"
                  />
                </div>
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowCustom(false)}
                    className="flex-1 p-6 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 p-6 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Confirm
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {currentQuestion.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(option.value)}
                    className="w-full text-left p-6 rounded-2xl border-2 border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 transition-all group flex items-center justify-between"
                  >
                    <span className="text-lg font-semibold text-slate-700 group-hover:text-indigo-700">{option.label}</span>
                    <ArrowRight className="text-slate-300 group-hover:text-indigo-600 transition-colors" size={20} />
                  </button>
                ))}
              </div>
            )}

            {step > 0 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="mt-8 flex items-center space-x-2 text-slate-400 hover:text-slate-600 font-medium transition-colors"
              >
                <ArrowLeft size={18} />
                <span>Go Back</span>
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
