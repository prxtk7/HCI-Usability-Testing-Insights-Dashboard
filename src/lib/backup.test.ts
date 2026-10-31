import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { BACKUP_FORMAT, BACKUP_VERSION, createBackupText, describeStudyContents, exportBackup, parseBackup } from './backup';
import { STORAGE_KEY } from './storage';
import { createStudyStore, freshSample } from './studyStore';
import { failingStorage, memoryStorage } from './testStorage';

const NOW = new Date('2026-10-31T10:00:00.000Z');
const clock = () => NOW;

/** Backup text for the sample after `change` has tampered with its parsed form. */
function tampered(change: (file: Record<string, any>) => void): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const file = JSON.parse(createBackupText(sampleStudyData, NOW));
  change(file);
  return JSON.stringify(file);
}

function errorsOf(text: string): string[] {
  const result = parseBackup(text);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

describe('createBackupText', () => {
  it('is versioned and contains every part of the study', () => {
    const file = JSON.parse(createBackupText(sampleStudyData, NOW));
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.backupVersion).toBe(BACKUP_VERSION);
    expect(file.exportedAt).toBe(NOW.toISOString());
    expect(file.data).toEqual(sampleStudyData);
    expect(Object.keys(file.data).sort()).toEqual(['attempts', 'findings', 'issues', 'participants', 'study', 'tasks']);
  });

  it('keeps recommendations and finding links', () => {
    const { data } = JSON.parse(createBackupText(sampleStudyData, NOW));
    expect(data.issues.some((i: { recommendation: string }) => i.recommendation !== '')).toBe(true);
    expect(data.findings[0].issueIds.length).toBeGreaterThan(0);
  });

  it('gets a clear filename', () => {
    const result = exportBackup(sampleStudyData, NOW);
    expect(result.ok && result.filename.endsWith('-backup-2026-10-31.json')).toBe(true);
  });
});

describe('parseBackup accepts', () => {
  it('its own export, unchanged (round trip)', () => {
    const result = parseBackup(createBackupText(sampleStudyData, NOW));
    expect(result).toEqual({ ok: true, data: sampleStudyData, exportedAt: NOW.toISOString() });
  });

  it('missing time and error values, keeping them as null', () => {
    const data = freshSample();
    data.attempts[0] = { ...data.attempts[0]!, timeSeconds: null, errorCount: null };
    const result = parseBackup(createBackupText(data, NOW));
    expect(result.ok && result.data.attempts[0]).toMatchObject({ timeSeconds: null, errorCount: null });
  });

  it('a study with no attempts, issues or findings', () => {
    const data: StudyData = { ...freshSample(), attempts: [], issues: [], findings: [] };
    expect(parseBackup(createBackupText(data, NOW)).ok).toBe(true);
  });

  it('a file with a byte-order mark', () => {
    expect(parseBackup(`\uFEFF${createBackupText(sampleStudyData, NOW)}`).ok).toBe(true);
  });
});

describe('parseBackup rejects', () => {
  it('malformed JSON', () => {
    expect(errorsOf('{"format":')[0]).toMatch(/not valid JSON/);
  });

  it('files that are not backups', () => {
    expect(errorsOf('[]')[0]).toMatch(/not a backup/);
    expect(errorsOf(JSON.stringify({ schemaVersion: 1, data: sampleStudyData }))[0]).toMatch(/not a backup/);
  });

  it('unsupported versions', () => {
    const errors = errorsOf(tampered((f) => { f.backupVersion = 99; }));
    expect(errors[0]).toMatch(/version 99.*only read version 1/);
    expect(errorsOf(tampered((f) => { delete f.backupVersion; })).length).toBe(1);
  });

  it('a missing or invalid export date', () => {
    expect(errorsOf(tampered((f) => { f.exportedAt = 'soon'; }))[0]).toMatch(/exportedAt/);
  });

  it('missing sections and required fields', () => {
    expect(errorsOf(tampered((f) => { delete f.data.tasks; })).join()).toMatch(/"tasks" is not a list/);
    expect(errorsOf(tampered((f) => { delete f.data.attempts[0].completed; })).join()).toMatch(/attempts\[0\]: "completed"/);
    expect(errorsOf(tampered((f) => { f.data.study.title = '  '; })).join()).toMatch(/Study details/);
    expect(errorsOf(tampered((f) => { f.data.issues[0].title = ''; })).join()).toMatch(/has no title/);
    expect(errorsOf(tampered((f) => { f.data.study.startDate = '2026-02-30'; })).join()).toMatch(/valid date/);
  });

  it('invalid values rather than converting them', () => {
    expect(errorsOf(tampered((f) => { f.data.attempts[0].errorCount = -1; })).join()).toMatch(/errorCount/);
    expect(errorsOf(tampered((f) => { f.data.attempts[0].timeSeconds = '60'; })).join()).toMatch(/timeSeconds/);
    expect(errorsOf(tampered((f) => { f.data.attempts[0].timeSeconds = 90_000; })).join()).toMatch(/over 24 hours/);
    expect(errorsOf(tampered((f) => { f.data.issues[0].severity = 5; })).join()).toMatch(/severity/);
  });

  it('blank and duplicate IDs', () => {
    expect(errorsOf(tampered((f) => { f.data.tasks[0].id = ' '; })).join()).toMatch(/tasks\[0\] has a blank ID/);
    expect(errorsOf(tampered((f) => { f.data.attempts[1].id = f.data.attempts[0].id; })).join()).toMatch(/"attempts" contains duplicate IDs/);
    expect(errorsOf(tampered((f) => { f.data.issues[1].id = f.data.issues[0].id; })).join()).toMatch(/"issues" contains duplicate IDs/);
  });

  it('every kind of broken reference', () => {
    expect(errorsOf(tampered((f) => { f.data.attempts[0].taskId = 'gone'; })).join()).toMatch(/refers to task "gone"/);
    expect(errorsOf(tampered((f) => { f.data.attempts[0].participantId = 'gone'; })).join()).toMatch(/refers to participant "gone"/);
    expect(errorsOf(tampered((f) => { f.data.issues[0].taskId = 'gone'; })).join()).toMatch(/refers to task "gone"/);
    expect(errorsOf(tampered((f) => { f.data.issues[0].affectedParticipantIds.push('gone'); })).join()).toMatch(/refers to participant "gone"/);
    expect(errorsOf(tampered((f) => { f.data.findings[0].issueIds.push('gone'); })).join()).toMatch(/refers to issue "gone"/);
  });

  it('rule breaks the app itself never allows', () => {
    expect(errorsOf(tampered((f) => { f.data.participants[1].code = f.data.participants[0].code; })).join()).toMatch(/used more than once/);
    expect(errorsOf(tampered((f) => { f.data.participants[0].code = 'Jane Smith'; })).join()).toMatch(/no names or spaces/);
    expect(errorsOf(tampered((f) => { f.data.tasks[1].code = f.data.tasks[0].code; })).length).toBeGreaterThan(0);
    expect(errorsOf(tampered((f) => { f.data.attempts[1].participantId = f.data.attempts[0].participantId; f.data.attempts[1].taskId = f.data.attempts[0].taskId; })).join()).toMatch(/repeats a participant and task/);
  });

  it('unknown fields instead of silently keeping or dropping them', () => {
    expect(errorsOf(tampered((f) => { f.data.tasks[0].extra = 1; })).join()).toMatch(/tasks\[0\]: unknown field "extra"/);
    expect(errorsOf(tampered((f) => { f.data.notes = []; })).join()).toMatch(/unknown field "notes"/);
  });
});

describe('importing into the store', () => {
  const imported = (): StudyData => ({ ...freshSample(), study: { ...freshSample().study, title: 'From backup', isSample: false } });

  it('replaces the study and persists it across a refresh', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage, clock);
    const parsed = parseBackup(createBackupText(imported(), NOW));
    if (!parsed.ok) throw new Error('expected a valid backup');

    const result = store.importStudy(parsed.data);
    expect(result.ok).toBe(true);
    expect(store.getState().data.study.title).toBe('From backup');
    expect(createStudyStore(storage, clock).getState().data).toEqual(imported());
  });

  it('round trips edited data through export, validation and storage without change', () => {
    const data = imported();
    data.attempts[2] = { ...data.attempts[2]!, timeSeconds: null, observation: 'Line one\nLine "two", three' };
    const storage = memoryStorage();
    const first = createStudyStore(storage, clock);
    first.update(() => data);

    const parsed = parseBackup(exportBackupText(first.getState().data));
    if (!parsed.ok) throw new Error('expected a valid backup');
    const second = createStudyStore(memoryStorage(), clock);
    second.importStudy(parsed.data);
    expect(second.getState().data).toEqual(data);
  });

  it('checking a file then cancelling leaves the study and storage untouched', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage, clock);
    store.update((d) => ({ ...d, study: { ...d.study, title: 'Keep me' } }));
    const before = storage.map.get(STORAGE_KEY);

    // Cancelling means importStudy is simply never called with the parsed data.
    expect(parseBackup(createBackupText(imported(), NOW)).ok).toBe(true);
    expect(store.getState().data.study.title).toBe('Keep me');
    expect(storage.map.get(STORAGE_KEY)).toBe(before);
  });

  it('reports failure and keeps the current study when saving fails', () => {
    const storage = failingStorage({ failSet: true });
    const store = createStudyStore(storage, clock);
    const result = store.importStudy(imported());
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/refused to save.*not changed/);
    expect(store.getState().data).toEqual(sampleStudyData);
  });

  it('says it is not saved when storage is unavailable', () => {
    const store = createStudyStore(null, clock);
    const result = store.importStudy(imported());
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/cannot be saved/);
    expect(store.getState().data.study.title).toBe('From backup');
  });

  it('keeps a copy of an unreadable saved record, and resumes saving', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'not json' });
    const store = createStudyStore(storage, clock);
    expect(store.importStudy(imported()).ok).toBe(true);
    expect(store.getState().saveMode).toBe('on');
    expect(store.getState().loadProblem).toBeNull();
    expect([...storage.map.values()]).toContain('not json');
  });
});

describe('describeStudyContents', () => {
  it('counts records in plain language', () => {
    expect(describeStudyContents(sampleStudyData)).toBe('5 tasks, 8 participants, 40 task attempts, 6 issues, 3 findings');
    expect(describeStudyContents({ ...sampleStudyData, findings: sampleStudyData.findings.slice(0, 1) })).toContain('1 finding');
  });
});

function exportBackupText(data: StudyData): string {
  const result = exportBackup(data, NOW);
  if (!result.ok) throw new Error('expected a backup');
  return result.text;
}
