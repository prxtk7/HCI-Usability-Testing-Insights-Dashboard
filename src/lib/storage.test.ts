import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { loadStudy, saveStudy, SCHEMA_VERSION, STORAGE_KEY, validateStudyData } from './storage';
import { failingStorage, memoryStorage } from './testStorage';

const envelope = (data: unknown, schemaVersion: unknown = SCHEMA_VERSION) =>
  JSON.stringify({ schemaVersion, savedAt: '2026-10-01T09:00:00.000Z', data });

describe('validateStudyData', () => {
  it('accepts the sample study', () => {
    expect(validateStudyData(sampleStudyData).ok).toBe(true);
  });

  it('reports missing required fields', () => {
    const broken = { ...sampleStudyData, study: { ...sampleStudyData.study, title: undefined } };
    const result = validateStudyData(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('study: "title" is missing or invalid');
  });

  it('reports a missing list', () => {
    const withoutIssues: Partial<StudyData> = { ...sampleStudyData };
    delete withoutIssues.issues;
    const result = validateStudyData(withoutIssues);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('"issues" is not a list');
  });

  it('rejects negative times and fractional error counts', () => {
    const [first, second, ...rest] = sampleStudyData.attempts;
    const result = validateStudyData({
      ...sampleStudyData,
      attempts: [{ ...first!, timeSeconds: -5 }, { ...second!, errorCount: 1.5 }, ...rest],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it('accepts null for unrecorded time and errors', () => {
    const [first, ...rest] = sampleStudyData.attempts;
    const result = validateStudyData({
      ...sampleStudyData,
      attempts: [{ ...first!, timeSeconds: null, errorCount: null }, ...rest],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate IDs and out-of-range severity', () => {
    const [first, ...rest] = sampleStudyData.issues;
    const result = validateStudyData({
      ...sampleStudyData,
      tasks: [...sampleStudyData.tasks, sampleStudyData.tasks[0]],
      issues: [{ ...first!, severity: 5 }, ...rest],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('"tasks" contains duplicate IDs');
      expect(result.errors).toContain('issues[0]: "severity" is missing or invalid');
    }
  });

  it('rejects non-objects', () => {
    expect(validateStudyData(null).ok).toBe(false);
    expect(validateStudyData([]).ok).toBe(false);
    expect(validateStudyData('study').ok).toBe(false);
  });
});

describe('loadStudy', () => {
  it('reports empty storage', () => {
    expect(loadStudy(memoryStorage())).toEqual({ status: 'empty' });
  });

  it('loads valid saved data', () => {
    const result = loadStudy(memoryStorage({ [STORAGE_KEY]: envelope(sampleStudyData) }));
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') {
      expect(result.data).toEqual(sampleStudyData);
      expect(result.savedAt).toBe('2026-10-01T09:00:00.000Z');
    }
  });

  it('handles malformed JSON without throwing and keeps the raw text', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"schemaVersion": 1, "data": ' });
    const result = loadStudy(storage);
    expect(result).toMatchObject({ status: 'invalid', reason: 'malformed-json', raw: '{"schemaVersion": 1, "data": ' });
    expect(storage.map.get(STORAGE_KEY)).toBe('{"schemaVersion": 1, "data": ');
  });

  it.each([
    ['a newer version', envelope(sampleStudyData, 2)],
    ['an older version', envelope(sampleStudyData, 0)],
    ['a version stored as text', envelope(sampleStudyData, '1')],
    ['no envelope (bare study data)', JSON.stringify(sampleStudyData)],
    ['a JSON value that is not an object', '42'],
  ])('rejects %s as unsupported', (_label, raw) => {
    const result = loadStudy(memoryStorage({ [STORAGE_KEY]: raw }));
    expect(result).toMatchObject({ status: 'invalid', reason: 'unsupported-version', raw });
  });

  it('rejects a supported version with missing fields', () => {
    const withoutTasks: Partial<StudyData> = { ...sampleStudyData };
    delete withoutTasks.tasks;
    const result = loadStudy(memoryStorage({ [STORAGE_KEY]: envelope(withoutTasks) }));
    expect(result).toMatchObject({ status: 'invalid', reason: 'invalid-data' });
    if (result.status === 'invalid') expect(result.message).toContain('"tasks" is not a list');
  });

  it('reports unavailable storage', () => {
    expect(loadStudy(null).status).toBe('unavailable');
    expect(loadStudy(failingStorage({ failGet: true })).status).toBe('unavailable');
  });
});

describe('saveStudy', () => {
  it('writes a versioned record that loads back unchanged', () => {
    const storage = memoryStorage();
    const now = new Date('2026-10-28T10:00:00.000Z');
    expect(saveStudy(storage, sampleStudyData, now)).toEqual({ ok: true, savedAt: now.toISOString() });

    const stored = JSON.parse(storage.map.get(STORAGE_KEY)!);
    expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loadStudy(storage)).toEqual({ status: 'loaded', data: sampleStudyData, savedAt: now.toISOString() });
  });

  it('returns an error instead of throwing when the browser refuses to save', () => {
    const result = saveStudy(failingStorage({ failSet: true }), sampleStudyData);
    expect(result.ok).toBe(false);
  });

  it('returns an error when storage is unavailable', () => {
    expect(saveStudy(null, sampleStudyData).ok).toBe(false);
  });
});
