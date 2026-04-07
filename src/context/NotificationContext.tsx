import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api';
import { parseISO, subMinutes, isAfter, isBefore, format } from 'date-fns';

interface NotificationContextType {
  permission: NotificationPermission;
  requestPermission: () => Promise<void>;
  showNotification: (title: string, body: string) => void;
  isSupported: boolean;
  error: string | null;
  dismissedReminder: boolean;
  dismissReminder: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedReminder, setDismissedReminder] = useState(false);
  const scheduledNotifications = useRef<Set<string>>(new Set());
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!('Notification' in window)) {
      setIsSupported(false);
      setPermission('denied');
    } else {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    setError(null);
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser.');
      return;
    }

    try {
      // Support both promise-based and callback-based requestPermission
      const result = await new Promise<NotificationPermission>((resolve) => {
        try {
          const res = Notification.requestPermission(resolve);
          if (res && typeof res.then === 'function') {
            res.then(resolve);
          }
        } catch (e) {
          // Fallback for very old browsers or specific iframe restrictions
          resolve('denied');
        }
      });

      setPermission(result);
      
      if (result === 'denied') {
        setError('Notification permission was denied. You may need to reset permissions in your browser settings or check if your browser allows notifications in iframes.');
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError('Failed to request notification permission. This might be blocked by your browser settings or iframe restrictions.');
    }
  };

  const showNotification = (title: string, body: string) => {
    if (permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico' // Assuming there's a favicon
      });
    }
  };

  const checkNotifications = async () => {
    if (!user || permission !== 'granted') return;

    const leadTime = user.concentrationProfile?.notificationLeadTime || 15;
    
    try {
      const [todos, schedule] = await Promise.all([
        api.todos.getAll(),
        api.schedule.get()
      ]);

      const now = new Date();

      // Combine all items to check
      const items = [
        ...todos.filter(t => t.status !== 'completed').map(t => ({
          id: `todo-${t.id}`,
          title: 'Upcoming Task',
          activity: t.activity,
          startTime: t.fixedTime ? `${t.date}T${t.fixedTime}` : null
        })),
        ...schedule.map(s => ({
          id: `schedule-${s.id}`,
          title: s.type === 'class' ? 'Upcoming Class' : s.type === 'work' ? 'Upcoming Work' : 'Upcoming Activity',
          activity: s.title,
          startTime: s.startTime
        }))
      ];

      items.forEach(item => {
        if (!item.startTime) return;
        
        const startTime = parseISO(item.startTime);
        const triggerTime = subMinutes(startTime, leadTime);

        // If it's time to notify and we haven't notified for this item yet
        if (isAfter(now, triggerTime) && isBefore(now, startTime) && !scheduledNotifications.current.has(item.id)) {
          showNotification(item.title, `${item.activity} starts in ${leadTime} minutes at ${format(startTime, 'HH:mm')}`);
          scheduledNotifications.current.add(item.id);
        }
      });

      // Cleanup old notifications from the set (e.g., items that have already started)
      scheduledNotifications.current.forEach(id => {
        const item = items.find(i => i.id === id);
        if (!item || (item.startTime && isAfter(now, parseISO(item.startTime)))) {
          scheduledNotifications.current.delete(id);
        }
      });

    } catch (err) {
      console.error('Error checking notifications:', err);
    }
  };

  useEffect(() => {
    if (user && permission === 'granted') {
      // Check every minute
      checkInterval.current = setInterval(checkNotifications, 60000);
      checkNotifications(); // Initial check
    } else {
      if (checkInterval.current) clearInterval(checkInterval.current);
    }

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [user, permission]);

  const dismissReminder = () => {
    setDismissedReminder(true);
  };

  return (
    <NotificationContext.Provider value={{ 
      permission, 
      requestPermission, 
      showNotification, 
      isSupported, 
      error,
      dismissedReminder,
      dismissReminder
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
