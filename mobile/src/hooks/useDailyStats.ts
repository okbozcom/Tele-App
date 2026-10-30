import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchTodayStats, TodayStatsResponse } from '../api/leadApi';
import { useAuthStore } from '../store/authStore';
import { getISTDayKey } from '../utils/dateUtils';

export function useDailyStats(customDate?: string) {
  const user = useAuthStore((s) => s.user);
  const [currentDayKey, setCurrentDayKey] = useState(() => customDate || getISTDayKey());

  // Track IST midnight rollover every 60s
  useEffect(() => {
    if (customDate) {
      setCurrentDayKey(customDate);
      return;
    }
    const timer = setInterval(() => {
      const today = getISTDayKey();
      setCurrentDayKey((prev) => (prev !== today ? today : prev));
    }, 60000);
    return () => clearInterval(timer);
  }, [customDate]);

  const {
    data: stats,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery<TodayStatsResponse>({
    queryKey: ['todayStats', user?._id, currentDayKey],
    queryFn: () => fetchTodayStats(currentDayKey),
    enabled: Boolean(user?._id),
    staleTime: 20000, // 20s cache
    refetchInterval: 45000, // gentle 45s poll
    refetchIntervalInBackground: false,
  });

  const attempts = stats?.attempts || 0;
  const connected = stats?.connected || 0;
  const notConnected = stats?.notConnected || 0;
  const talkSeconds = stats?.talkSeconds || 0;
  const incoming = stats?.incoming || 0;
  const connectRate = stats?.connectRate || (attempts > 0 ? Math.round((connected / attempts) * 100) : 0);

  // Formatter helpers
  const formattedTalkTime = formatSecondsToMMSS(talkSeconds);
  const formattedAverageDuration =
    connected > 0 ? formatSecondsToReadable(Math.round(talkSeconds / connected)) : '0s';

  return {
    stats,
    dayIST: currentDayKey,
    attempts,
    connected,
    notConnected,
    talkSeconds,
    incoming,
    connectRate,
    formattedTalkTime,
    formattedAverageDuration,
    isLoading,
    isRefetching,
    refetch,
    error,
  };
}

function formatSecondsToMMSS(totalSec: number): string {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00';
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSecondsToReadable(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0s';
  const mins = Math.floor(sec / 60);
  const remainingSecs = sec % 60;
  if (mins === 0) return `${remainingSecs}s`;
  if (remainingSecs === 0) return `${mins}m`;
  return `${mins}m ${remainingSecs}s`;
}
