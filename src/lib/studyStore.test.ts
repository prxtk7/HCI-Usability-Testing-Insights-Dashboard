import { describe, expect, it, vi } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { BACKUP_KEY, SCHEMA_VERSION, STORAGE_KEY } from './storage';
import { createStudyStore, freshSample } from './studyStore';
import { failingStorage, memoryStorage } from './testStorage';

const NOW = new Date('2026-10-28T10:00:00.000Z');
const clock = () => NOW;

const rename = (title: string) => (data: StudyData) => ({ ...data, study: { ...data.study, title } });

function savedRecord(data: StudyData): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: '2026-10-01T09:00:00.000Z', data });
}

describe('startup', () => {
  it('starts from the sample when storage is empty, without writing anything', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage, clock);
    expect(store.getState().data).toEqual(sampleStudyData);
    expect(store.getState().saveMode).toBe('on');
    expect(storage.map.size).toBe(0);
  });

  it('loads valid saved data and does not overwrite it with the sample', () => {
    const edited = rename('My own study')(sampleStudyData);
    const raw = savedRecord(edited);
    const storage = memoryStorage({ [STORAGE_KEY]: raw });

    const store = createStudyStore(storage, clock);
    expect(store.getState().data.study.title).toBe('My own study');
    expect(store.getState().lastSavedAt).toBe('2026-10-01T09:00:00.000Z');
    expect(storage.map.get(STORAGE_KEY)).toBe(raw);
  });

  it('pauses saving and keeps an unreadable record untouched', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'not json' });
    const store = createStudyStore(storage, clock);

    expect(store.getState().saveMode).toBe('paused');
    expect(store.getState().loadProblem?.reason).toBe('malformed-json');
    expect(store.getState().data).toEqual(sampleStudyData);

    store.update(rename('Changed while paused'));
    expect(store.getState().data.study.title).toBe('Changed while paused');
    expect(storage.map.get(STORAGE_KEY)).toBe('not json');
  });

  it('turns saving off when storage is unavailable', () => {
    const store = createStudyStore(null, clock);
    expect(store.getState().saveMode).toBe('off');
    expect(store.getState().storageWarning).toMatch(/not available/);
  });
});

describe('update', () => {
  it('saves changes so they survive a refresh', () => {
    const storage = memoryStorage();
    createStudyStore(storage, clock).update(rename('Renamed study'));

    // A new store reading the same storage is what happens on page refresh.
    const afterRefresh = createStudyStore(storage, clock);
    expect(afterRefresh.getState().data.study.title).toBe('Renamed study');
    expect(afterRefresh.getState().lastSavedAt).toBe(NOW.toISOString());
  });

  it('notifies subscribers once per change and stops after unsubscribing', () => {
    const store = createStudyStore(memoryStorage(), clock);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update(rename('One'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.update(rename('Two'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the change returns the same data', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage, clock);
    const listener = vi.fn();
    store.subscribe(listener);

    store.update((data) => data);
    expect(listener).not.toHaveBeenCalled();
    expect(storage.map.size).toBe(0);
  });

  it('keeps the change in memory and warns when saving fails', () => {
    const store = createStudyStore(failingStorage({ failSet: true }), clock);
    store.update(rename('Unsaved'));
    expect(store.getState().data.study.title).toBe('Unsaved');
    expect(store.getState().storageWarning).toMatch(/refused to save/);
  });
});

describe('restoreSample', () => {
  it('replaces edited data with the sample and saves it', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: savedRecord(rename('My own study')(sampleStudyData)) });
    const store = createStudyStore(storage, clock);

    const result = store.restoreSample();
    expect(result.ok).toBe(true);
    expect(store.getState().data).toEqual(sampleStudyData);
    expect(createStudyStore(storage, clock).getState().data).toEqual(sampleStudyData);
  });

  it('backs up an unreadable record, then resumes saving', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"broken"' });
    const store = createStudyStore(storage, clock);

    expect(store.restoreSample().ok).toBe(true);
    expect(storage.map.get(BACKUP_KEY)).toBe('{"broken"');
    expect(store.getState().saveMode).toBe('on');
    expect(store.getState().loadProblem).toBeNull();

    store.update(rename('Saved again'));
    expect(createStudyStore(storage, clock).getState().data.study.title).toBe('Saved again');
  });

  it('leaves current data unchanged if the sample cannot be saved', () => {
    const storage = failingStorage({ failSet: true }, { [STORAGE_KEY]: savedRecord(rename('Keep me')(sampleStudyData)) });
    const store = createStudyStore(storage, clock);

    const result = store.restoreSample();
    expect(result.ok).toBe(false);
    expect(store.getState().data.study.title).toBe('Keep me');
  });

  it('restores in memory only when storage is unavailable', () => {
    const store = createStudyStore(null, clock);
    store.update(rename('Temporary'));

    const result = store.restoreSample();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/cannot be saved/);
    expect(store.getState().data).toEqual(sampleStudyData);
  });
});

describe('freshSample', () => {
  it('returns an independent copy of the sample', () => {
    const copy = freshSample();
    copy.study.title = 'Mutated';
    expect(sampleStudyData.study.title).not.toBe('Mutated');
  });
});
