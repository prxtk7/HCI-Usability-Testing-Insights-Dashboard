// FICTIONAL SAMPLE DATA.
// The study, product, participants, results, quotes and findings below are
// invented for demonstration. They do not come from real people or real research.

import type { Finding, Participant, Task, TaskAttempt, UsabilityIssue, StudyData } from '../types';

const tasks: Task[] = [
  {
    id: 'task-find-slot',
    code: 'T1',
    name: 'Find the earliest available advising slot',
    description: 'From the home page, find the earliest open appointment with any academic advisor.',
    expectedOutcome: 'Participant identifies the earliest open slot and its date and time.',
  },
  {
    id: 'task-book',
    code: 'T2',
    name: 'Book the appointment',
    description: 'Book the slot found in T1 and choose "Course planning" as the reason.',
    expectedOutcome: 'Booking is submitted with the correct reason selected.',
  },
  {
    id: 'task-confirm',
    code: 'T3',
    name: 'Verify the booking is confirmed',
    description: 'Check whether the appointment is confirmed and find the room or video link.',
    expectedOutcome: 'Participant states the booking is confirmed and reports the location.',
  },
  {
    id: 'task-reschedule',
    code: 'T4',
    name: 'Reschedule to a different day',
    description: 'Move the appointment to any slot on a different day.',
    expectedOutcome: 'Appointment shows the new date; the old slot is released.',
  },
  {
    id: 'task-cancel',
    code: 'T5',
    name: 'Cancel the appointment',
    description: 'Cancel the rescheduled appointment.',
    expectedOutcome: 'Appointment is removed from "My appointments".',
  },
];

const participants: Participant[] = [
  { id: 'p-01', code: 'P01', profile: 'Undergraduate, first year (fictional)' },
  { id: 'p-02', code: 'P02', profile: 'Undergraduate, final year (fictional)' },
  { id: 'p-03', code: 'P03', profile: 'Postgraduate, taught (fictional)' },
  { id: 'p-04', code: 'P04', profile: 'Undergraduate, second year (fictional)' },
  { id: 'p-05', code: 'P05', profile: 'Mature student, part-time (fictional)' },
  { id: 'p-06', code: 'P06', profile: 'Postgraduate, research (fictional)' },
  { id: 'p-07', code: 'P07', profile: 'Exchange student (fictional)' },
  { id: 'p-08', code: 'P08', profile: 'Undergraduate, first year (fictional)' },
];

// [participantId, taskId, completed, seconds | null, errors | null, observation, feedback]
type Row = [string, string, boolean, number | null, number | null, string?, string?];

const rows: Row[] = [
  // T1 — find slot
  ['p-01', 'task-find-slot', true, 142, 2, 'Opened two advisor profiles before finding the calendar.'],
  ['p-02', 'task-find-slot', false, 300, 4, 'Searched the "Services" menu repeatedly; reached the time limit.', '"I assumed there were no free slots."'],
  ['p-03', 'task-find-slot', true, 98, 1],
  ['p-04', 'task-find-slot', true, 175, 3, 'Missed the small "next week" arrow at first.'],
  ['p-05', 'task-find-slot', false, 300, 5, 'Did not realise availability appears only after choosing an advisor.'],
  ['p-06', 'task-find-slot', true, 121, 1],
  ['p-07', 'task-find-slot', true, 160, 2, 'Scrolled past the advisor list twice.'],
  ['p-08', 'task-find-slot', false, null, 3, 'Screen recording failed; time not captured. Gave up per facilitator notes.'],
  // T2 — book
  ['p-01', 'task-book', true, 64, 0],
  ['p-02', 'task-book', true, 88, 1, 'Unsure which reason matched "Course planning".'],
  ['p-03', 'task-book', true, 52, 0],
  ['p-04', 'task-book', true, 71, 1],
  ['p-05', 'task-book', true, 95, 1],
  ['p-06', 'task-book', true, 58, 0],
  ['p-07', 'task-book', true, 77, 0],
  ['p-08', 'task-book', false, 140, 2, 'Selected "Academic standing review" believing it meant course planning.'],
  // T3 — confirm
  ['p-01', 'task-confirm', true, 45, 1],
  ['p-02', 'task-confirm', false, 90, 2, 'Read "Request received" as still pending.', '"Is it booked or not?"'],
  ['p-03', 'task-confirm', true, 38, 0],
  ['p-04', 'task-confirm', false, 102, 2, 'Looked for a confirmation email that had not been sent yet.'],
  ['p-05', 'task-confirm', true, 61, 1, 'Hesitated over the wording before checking "My appointments".'],
  ['p-06', 'task-confirm', true, 40, 0],
  ['p-07', 'task-confirm', false, 85, 1, 'Could not find the room details.'],
  ['p-08', 'task-confirm', true, 70, 1],
  // T4 — reschedule
  ['p-01', 'task-reschedule', true, 110, 1],
  ['p-02', 'task-reschedule', true, 134, 2, 'Worried the original slot was lost before choosing a new one.'],
  ['p-03', 'task-reschedule', true, 89, 0],
  ['p-04', 'task-reschedule', true, 150, 2],
  ['p-05', 'task-reschedule', false, 240, 3, 'Original appointment was cancelled before a new slot was chosen.', '"Now I have nothing booked."'],
  ['p-06', 'task-reschedule', true, 97, 1],
  ['p-07', 'task-reschedule', true, 128, 1],
  ['p-08', 'task-reschedule', true, 141, null, 'Errors not coded for this attempt (note-taker absent).'],
  // T5 — cancel
  ['p-01', 'task-cancel', true, 34, 0],
  ['p-02', 'task-cancel', true, 41, 0],
  ['p-03', 'task-cancel', true, 29, 0],
  ['p-04', 'task-cancel', true, 38, 0],
  ['p-05', 'task-cancel', true, 57, 1],
  ['p-06', 'task-cancel', true, 31, 0],
  ['p-07', 'task-cancel', true, 44, 0],
  ['p-08', 'task-cancel', true, 36, 0],
];

const attempts: TaskAttempt[] = rows.map(
  ([participantId, taskId, completed, timeSeconds, errorCount, observation = '', feedback = '']) => ({
    id: `a-${participantId}-${taskId}`,
    participantId,
    taskId,
    completed,
    timeSeconds,
    errorCount,
    observation,
    feedback,
  }),
);

const issues: UsabilityIssue[] = [
  {
    id: 'issue-availability-hidden',
    title: 'Availability is hidden until an advisor is chosen',
    description:
      'The home page lists advisors but shows no open times. Participants expected a single calendar of available slots.',
    taskId: 'task-find-slot',
    evidence: 'Example evidence: 3 of 8 fictional participants failed T1; 2 more needed several attempts.',
    severity: 4,
    status: 'open',
    affectedParticipantIds: ['p-02', 'p-04', 'p-05', 'p-07', 'p-08'],
    recommendation:
      'Add a "Next available" view that lists open slots across all advisors, with an optional advisor filter.',
  },
  {
    id: 'issue-confirmation-wording',
    title: '"Request received" reads as a pending booking',
    description:
      'After booking, the page says "Request received" without stating that the appointment is confirmed or where it is.',
    taskId: 'task-confirm',
    evidence: 'Example evidence: 3 fictional participants failed T3; 2 others hesitated over the wording.',
    severity: 3,
    status: 'open',
    affectedParticipantIds: ['p-02', 'p-04', 'p-05', 'p-07', 'p-08'],
    recommendation:
      'Replace with "Appointment confirmed", then show date, time, advisor and location, plus an "Add to calendar" action.',
  },
  {
    id: 'issue-week-navigation',
    title: 'Calendar "next week" control is easy to miss',
    description: 'The calendar defaults to the current week and the arrow to move forward is small and low contrast.',
    taskId: 'task-find-slot',
    evidence: 'Example evidence: 4 fictional participants overlooked the control before finding it.',
    severity: 2,
    status: 'open',
    affectedParticipantIds: ['p-01', 'p-04', 'p-05', 'p-07'],
    recommendation: 'Use a labelled "Next week" button and jump straight to the first week with availability.',
  },
  {
    id: 'issue-reschedule-cancels-first',
    title: 'Rescheduling cancels the original slot too early',
    description: 'Starting a reschedule releases the current appointment before a new slot is confirmed.',
    taskId: 'task-reschedule',
    evidence: 'Example evidence: 1 fictional participant lost their booking; 1 more voiced the same concern.',
    severity: 3,
    status: 'in-progress',
    affectedParticipantIds: ['p-02', 'p-05'],
    recommendation: 'Keep the original appointment until the new slot is confirmed, and say so on screen.',
  },
  {
    id: 'issue-reason-labels',
    title: 'Appointment reason labels use internal terms',
    description: 'Options such as "Academic standing review" are administrative terms students do not recognise.',
    taskId: 'task-book',
    evidence: 'Example evidence: 2 fictional participants were unsure which reason to pick; 1 chose the wrong one.',
    severity: 2,
    status: 'resolved',
    affectedParticipantIds: ['p-02', 'p-08'],
    recommendation: 'Rewrite reasons in plain language with a one-line hint under each option.',
  },
  {
    id: 'issue-timezone',
    title: 'Times are shown without a time zone',
    description: 'Slot times have no time zone, which matters for students joining online from abroad.',
    taskId: null,
    evidence: 'Example evidence: raised by 1 fictional participant during the debrief.',
    severity: 1,
    status: 'open',
    affectedParticipantIds: ['p-07'],
    recommendation: 'Show the time zone next to times and convert online appointments to the viewer’s local time.',
  },
];

const findings: Finding[] = [
  {
    id: 'finding-availability',
    title: 'Finding open appointments is the main barrier',
    detail:
      'T1 had the lowest completion rate. Participants expected to see open times first, not to browse advisor profiles.',
    issueIds: ['issue-availability-hidden', 'issue-week-navigation'],
  },
  {
    id: 'finding-confirmation',
    title: 'Confirmation wording creates doubt',
    detail: 'Several participants could not tell whether their appointment was confirmed or still pending.',
    issueIds: ['issue-confirmation-wording'],
  },
  {
    id: 'finding-booking-form',
    title: 'The booking form works once a slot is found',
    detail: 'Most participants completed T2 quickly; the remaining friction was unclear reason labels.',
    issueIds: ['issue-reason-labels'],
  },
];

export const sampleStudyData: StudyData = {
  study: {
    id: 'study-campusbook-2026',
    title: 'CampusBook advising appointments — baseline usability test',
    product: 'CampusBook (fictional university appointment-booking service)',
    purpose:
      'Identify where students struggle to find, book, confirm and change academic advising appointments, to prioritise fixes before the next term.',
    method: 'Moderated remote task-based testing, think-aloud, 8 participants, 5 tasks.',
    status: 'analysis',
    startDate: '2026-09-14',
    endDate: '2026-09-25',
    isSample: true,
  },
  tasks,
  participants,
  attempts,
  issues,
  findings,
};
