import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import {
  ATTEMPT_HEADERS,
  attemptsCsv,
  escapeCsvCell,
  exportAttempts,
  exportFilename,
  exportIssues,
  ISSUE_HEADERS,
  issuesCsv,
  toCsv,
} from './exportData';
import { calculateIssuePriority } from './priority';

const NOW = new Date('2026-10-31T10:00:00.000Z');

function small(): StudyData {
  return {
    study: { ...sampleStudyData.study, title: 'My Study: Round 2!', isSample: false },
    tasks: [{ id: 't1', code: 'T1', name: 'Find, book', description: '', expectedOutcome: 'Booked' }],
    participants: [{ id: 'p1', code: 'P01', profile: 'SECRET-PROFILE' }],
    attempts: [
      {
        id: 'a1',
        participantId: 'p1',
        taskId: 't1',
        completed: false,
        timeSeconds: null,
        errorCount: null,
        observation: 'Said "no", then\nleft',
        feedback: '',
      },
    ],
    issues: [
      {
        id: 'i1',
        title: 'Hidden, button',
        description: 'Desc',
        taskId: 't1',
        evidence: '1 of 1',
        severity: 3,
        status: 'in-progress',
        affectedParticipantIds: ['p1'],
        recommendation: 'Show it',
      },
    ],
    findings: [],
  };
}

describe('escapeCsvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('one\ntwo')).toBe('"one\ntwo"');
    expect(escapeCsvCell('one\r\ntwo')).toBe('"one\r\ntwo"');
    expect(escapeCsvCell('plain')).toBe('plain');
  });

  it('writes missing values as empty cells and keeps real zeros', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(0)).toBe('0');
  });

  it('stops text being run as a spreadsheet formula, but leaves numbers alone', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell(-1)).toBe('-1');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('a,b\r\n1,');
  });
});

describe('attemptsCsv', () => {
  it('includes the attempt fields, with empty cells for missing values', () => {
    const lines = attemptsCsv(small()).split('\r\n');
    expect(lines[0]).toBe(ATTEMPT_HEADERS.join(','));
    expect(lines[1]).toBe('a1,p1,P01,t1,T1,"Find, book",not completed,,,"Said ""no"", then\nleft",');
  });

  it('does not export participant profiles', () => {
    expect(attemptsCsv(small())).not.toContain('SECRET-PROFILE');
    expect(issuesCsv(small())).not.toContain('SECRET-PROFILE');
  });

  it('exports one row per attempt in the sample', () => {
    expect(attemptsCsv(sampleStudyData).split('\r\n').filter((l) => l.startsWith('a-p-'))).toHaveLength(
      sampleStudyData.attempts.length,
    );
  });
});

describe('issuesCsv', () => {
  it('includes the issue fields and current priority', () => {
    const lines = issuesCsv(small()).split('\r\n');
    expect(lines[0]).toBe(ISSUE_HEADERS.join(','));
    expect(lines[1]).toBe(
      'i1,"Hidden, button",Desc,3,Major,In progress,3.00,high,t1,T1,"Find, book",p1,P01,1 of 1,Show it',
    );
  });

  it('matches the priority calculation for every sample issue', () => {
    const csv = issuesCsv(sampleStudyData);
    for (const issue of sampleStudyData.issues) {
      const { score } = calculateIssuePriority(issue, sampleStudyData.participants, sampleStudyData.attempts);
      expect(csv).toContain(`,${score!.toFixed(2)},`);
    }
  });

  it('leaves task columns and score empty when they do not apply', () => {
    const data = small();
    data.participants = [];
    data.attempts = [];
    data.issues = [{ ...data.issues[0]!, taskId: null, affectedParticipantIds: [] }];
    expect(issuesCsv(data).split('\r\n')[1]).toBe(
      'i1,"Hidden, button",Desc,3,Major,In progress,,not enough data,,,,,,1 of 1,Show it',
    );
  });
});

describe('export actions', () => {
  it('uses a meaningful filename and marks the fictional sample', () => {
    expect(exportFilename(small().study, 'task-attempts', 'csv', NOW)).toBe('my-study-round-2-task-attempts-2026-10-31.csv');
    expect(exportFilename(sampleStudyData.study, 'backup', 'json', NOW)).toContain('-fictional-sample-backup-2026-10-31.json');
  });

  it('adds a UTF-8 marker for Excel', () => {
    const result = exportAttempts(small(), NOW);
    expect(result.ok && result.text.startsWith('\uFEFF')).toBe(true);
  });

  it('reports an empty dataset instead of making an empty file', () => {
    const empty = { ...small(), attempts: [], issues: [] };
    expect(exportAttempts(empty, NOW)).toEqual({ ok: false, message: expect.stringMatching(/no task attempts/) });
    expect(exportIssues(empty, NOW)).toEqual({ ok: false, message: expect.stringMatching(/no usability issues/) });
  });
});
