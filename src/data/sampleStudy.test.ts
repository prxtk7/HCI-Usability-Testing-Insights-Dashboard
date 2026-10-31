import { describe, expect, it } from 'vitest';
import { sampleStudyData } from './sampleStudy';

// Guards the sample data against broken links (e.g. a typo in a task ID).
describe('sample study data', () => {
  const { tasks, participants, attempts, issues, findings } = sampleStudyData;
  const taskIds = new Set(tasks.map((t) => t.id));
  const participantIds = new Set(participants.map((p) => p.id));
  const issueIds = new Set(issues.map((i) => i.id));

  it('has unique IDs', () => {
    for (const list of [tasks, participants, attempts, issues, findings]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('only references records that exist', () => {
    for (const a of attempts) {
      expect(taskIds.has(a.taskId)).toBe(true);
      expect(participantIds.has(a.participantId)).toBe(true);
    }
    for (const i of issues) {
      if (i.taskId !== null) expect(taskIds.has(i.taskId)).toBe(true);
      for (const p of i.affectedParticipantIds) expect(participantIds.has(p)).toBe(true);
    }
    for (const f of findings) {
      for (const id of f.issueIds) expect(issueIds.has(id)).toBe(true);
    }
  });

  it('is marked as fictional', () => {
    expect(sampleStudyData.study.isSample).toBe(true);
  });
});
