// The single place that holds the current study and changes it.
//
// - Pages read `state.data` and call `update(...)` to change it.
// - Every successful `update` is saved straight away, so there is no
//   separate "watch for changes, then save" step that could loop.
// - Nothing is written to storage at startup, so valid saved data is
//   never overwritten by the sample study.
//
// This file has no React code. React connects to it via `useStudyStore`
// (see App.tsx), and tests can drive it directly with a fake storage.

import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import {
  backupRawRecord,
  loadStudy,
  saveStudy,
  type KeyValueStore,
  type LoadProblemReason,
} from './storage';

/**
 * on      – changes are saved after every update.
 * paused  – the saved record could not be read. It is left untouched and
 *           changes stay in memory until the user restores the sample.
 * off     – browser storage is unavailable. Changes last until the tab closes.
 */
export type SaveMode = 'on' | 'paused' | 'off';

export interface LoadProblem {
  reason: LoadProblemReason;
  message: string;
  /** The unreadable saved text, kept so the user can download it. */
  raw: string;
}

export interface StudyState {
  data: StudyData;
  saveMode: SaveMode;
  loadProblem: LoadProblem | null;
  /** Latest storage warning (unavailable storage or a failed save), if any. */
  storageWarning: string | null;
  lastSavedAt: string | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface StudyStore {
  getState(): StudyState;
  subscribe(listener: () => void): () => void;
  update(change: (current: StudyData) => StudyData): void;
  restoreSample(): ActionResult;
  /** Replaces the study with already-validated data from a backup file. */
  importStudy(data: StudyData): ActionResult;
}

/** A fresh copy, so edits can never change the built-in sample itself. */
export function freshSample(): StudyData {
  return structuredClone(sampleStudyData);
}

export function initialState(storage: KeyValueStore | null): StudyState {
  const result = loadStudy(storage);
  switch (result.status) {
    case 'loaded':
      return { data: result.data, saveMode: 'on', loadProblem: null, storageWarning: null, lastSavedAt: result.savedAt };
    case 'empty':
      return { data: freshSample(), saveMode: 'on', loadProblem: null, storageWarning: null, lastSavedAt: null };
    case 'invalid':
      return {
        data: freshSample(),
        saveMode: 'paused',
        loadProblem: { reason: result.reason, message: result.message, raw: result.raw },
        storageWarning: null,
        lastSavedAt: null,
      };
    case 'unavailable':
      return { data: freshSample(), saveMode: 'off', loadProblem: null, storageWarning: result.message, lastSavedAt: null };
  }
}

export function createStudyStore(storage: KeyValueStore | null, now: () => Date = () => new Date()): StudyStore {
  let state = initialState(storage);
  const listeners = new Set<() => void>();

  function setState(next: StudyState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  /** Replaces the whole study. Only changes the state once the new data is safely saved. */
  function replaceStudy(data: StudyData, messages: { saved: string; sessionOnly: string }): ActionResult {
    if (!storage) {
      setState({ ...state, data });
      return { ok: true, message: messages.sessionOnly };
    }

    // Keep a copy of an unreadable record before replacing it.
    if (state.loadProblem && !backupRawRecord(storage, state.loadProblem.raw)) {
      return { ok: false, message: 'Could not back up the unreadable saved data, so nothing was replaced.' };
    }

    const saved = saveStudy(storage, data, now());
    if (!saved.ok) {
      return { ok: false, message: `${saved.message} Your current data was not changed.` };
    }
    setState({ data, saveMode: 'on', loadProblem: null, storageWarning: null, lastSavedAt: saved.savedAt });
    return { ok: true, message: messages.saved };
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    update(change) {
      const data = change(state.data);
      if (data === state.data) return;

      if (state.saveMode !== 'on') {
        setState({ ...state, data });
        return;
      }
      const saved = saveStudy(storage, data, now());
      setState(
        saved.ok
          ? { ...state, data, storageWarning: null, lastSavedAt: saved.savedAt }
          : { ...state, data, storageWarning: `${saved.message} Recent changes are kept only until this tab closes.` },
      );
    },

    restoreSample() {
      return replaceStudy(freshSample(), {
        saved: 'Sample study restored and saved in this browser.',
        sessionOnly: 'Sample study restored for this session. It cannot be saved because browser storage is unavailable.',
      });
    },

    importStudy(data) {
      return replaceStudy(data, {
        saved: 'Backup imported and saved in this browser.',
        sessionOnly: 'Backup imported for this session. It cannot be saved because browser storage is unavailable.',
      });
    },
  };
}
