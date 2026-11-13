import { useEffect, useState, useCallback, useRef } from 'react';
import { testConnection } from '../lib/firebase';

export interface DetailedOnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  isChecking: boolean;
  justDisconnected: boolean;
  dismissDisconnectedAlert: () => void;
  dismissReconnectedToast: () => void;
  checkConnection: () => Promise<boolean>;
}

export function useDetailedOnlineStatus(): DetailedOnlineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [justDisconnected, setJustDisconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (online) {
      const dbConnected = await testConnection();
      online = dbConnected;
    }
    setIsOnline(online);
    setIsChecking(false);

    if (online && !prevOnlineRef.current) {
      setWasOffline(true);
      setJustDisconnected(false);
      prevOnlineRef.current = true;
    } else if (!online && prevOnlineRef.current) {
      setJustDisconnected(true);
      prevOnlineRef.current = false;
    }
    return online;
  }, []);

  const dismissDisconnectedAlert = useCallback(() => {
    setJustDisconnected(false);
  }, []);

  const dismissReconnectedToast = useCallback(() => {
    setWasOffline(false);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!prevOnlineRef.current) {
        setWasOffline(true);
        setJustDisconnected(false);
        const timer = setTimeout(() => setWasOffline(false), 7000);
        return () => clearTimeout(timer);
      }
      prevOnlineRef.current = true;
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustDisconnected(true);
      setWasOffline(false);
      prevOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificação periódica a cada 15 segundos
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined') {
        const navOnline = navigator.onLine;
        if (!navOnline && isOnline) {
          setIsOnline(false);
          setJustDisconnected(true);
          prevOnlineRef.current = false;
        } else if (navOnline && !isOnline) {
          setIsOnline(true);
          setWasOffline(true);
          setJustDisconnected(false);
          prevOnlineRef.current = true;
        }
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isOnline]);

  return {
    isOnline,
    wasOffline,
    isChecking,
    justDisconnected,
    dismissDisconnectedAlert,
    dismissReconnectedToast,
    checkConnection,
  };
}

export function useOnlineStatus(): boolean {
  const { isOnline } = useDetailedOnlineStatus();
  return isOnline;
}
