import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ConfirmSheet from './ConfirmSheet';
import { applyToDraft, draftNeedsConfirm, hasLoggedSets, loggedSetCount, readDraft } from './workoutDraft';

/**
 * Hands session exercises to the workout draft. Always merges (existing sets are never replaced) and
 * asks first when a workout is running or has logged sets. Render `dialog` somewhere in the page.
 * job: { exercises, title, notes, startNow, stay }.
 */
export default function useDraftHandoff({ onApplied } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);

  const commit = (job) => {
    if (!user?.id) return null;
    const result = applyToDraft(user.id, job.exercises, { title: job.title, notes: job.notes, startNow: job.startNow });
    onApplied?.(result, job);
    if (!job.stay) navigate('/workout');
    return result;
  };

  const request = (job) => {
    if (!user?.id || !job?.exercises?.length) return false;
    if (draftNeedsConfirm(user.id)) { setPending(job); return true; }
    commit(job);
    return true;
  };

  let dialog = null;
  if (pending && user?.id) {
    const draft = readDraft(user.id);
    const logged = hasLoggedSets(draft?.sessionExercises) ? loggedSetCount(draft.sessionExercises) : 0;
    const count = pending.exercises.length;
    dialog = <ConfirmSheet
      title="Add to your current workout?"
      body={`${logged ? `You have ${logged} logged ${logged === 1 ? 'set' : 'sets'} in a workout in progress. ` : 'A workout is already in progress. '}${count} ${count === 1 ? 'movement' : 'movements'} will be added to the end. Nothing you have logged is changed${pending.startNow ? ' and the workout keeps its original start time' : ''}.`}
      confirmLabel="Add to current workout"
      onConfirm={() => { const job = pending; setPending(null); commit(job); }}
      onCancel={() => setPending(null)}
    />;
  }
  return { request, dialog };
}
