/**
 * useNetworkState — tracks online/offline connectivity
 * Triggers sync when coming back online.
 */

import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncService } from '@/services/sync';

interface NetworkState {
  isOnline: boolean;
  isConnected: boolean | null;
  connectionType: string | null;
}

export function useNetworkState() {
  const [state, setState] = useState<NetworkState>({
    isOnline: true,
    isConnected: null,
    connectionType: null,
  });

  const handleConnectivityChange = useCallback(
    async (netState: NetInfoState) => {
      const wasOnline = state.isOnline;
      const isNowOnline = netState.isConnected === true && netState.isInternetReachable !== false;

      setState({
        isOnline: isNowOnline,
        isConnected: netState.isConnected,
        connectionType: netState.type,
      });

      // Auto-sync when coming back online
      if (!wasOnline && isNowOnline) {
        try {
          await syncService.sync();
        } catch (error) {
          console.warn('[Network] Auto-sync on reconnect failed:', error);
        }
      }
    },
    [state.isOnline]
  );

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(handleConnectivityChange);

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(handleConnectivityChange);

    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
