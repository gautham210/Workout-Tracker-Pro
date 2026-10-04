import { useEffect, useState } from 'react';
import { getSyncState, onSyncStateChange, SyncState } from './sync';

/** Subscribes a component to the current user's sync state. */
export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState());
  useEffect(() => onSyncStateChange(setState), []);
  return state;
}
