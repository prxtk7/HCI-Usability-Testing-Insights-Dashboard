import type { StudyData } from '../types';
import { attemptsForKnownTasks, summarizeAttempts, summarizeByTask } from '../lib/metrics';
import { rankIssues } from '../lib/priority';
import { EMPTY, formatDate, formatDecimal, formatDuration, formatPercent } from '../lib/format';
import { buildFindingEvidence } from '../lib/recommendations';
import { pageHref, recordHref } from '../navigation';
import { Card, EmptyState, MetricCard, PageHeader } from '../components/ui';
import { FictionalBadge, IssueStatusBadge, PriorityBadge, SeverityBadge, StudyStatusBadge } from '../components/badges';
import { TaskComparisonChart } from '../components/TaskComparisonChart';
import { TaskOutcomeChart } from '../components/TaskOutcomeChart';

const TOP_ISSUE_COUNT = 5;

export function DashboardPage({ data }: { data: StudyData }) {
  const { study, tasks, participants, issues } = data;

  // Every number below is derived from the stored records on each render.
  const attempts = attemptsForKnownTasks(tasks, data.attempts);
  const overall = summarizeAttempts(attempts);
  const perTask = summarizeByTask(tasks, attempts);
  const ranked = rankIssues(
    issues.filter((i) => i.status !== 'resolved' && i.status !== 'wont-fix'),
    participants,
    attempts,
  );
  const taskCode = new Map(tasks.map((t) => [t.id, t.code]));
  const findingEvidence = buildFindingEvidence(data);
  const evaluatedTasks = perTask.filter((m) => m.attempts > 0).length;
  const successesWithoutTime = overall.completed - overall.timeSampleSize;
  const hasErrorCounts = overall.attempts > overall.missingErrors;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Study overview"
        title={study.title}
        lede={study.purpose}
        meta={
          <>
            <StudyStatusBadge status={study.status} />
            {study.isSample && <FictionalBadge />}
            <span>
              {formatDate(study.startDate)} – {formatDate(study.endDate)}
            </span>
            <span>{study.method}</span>
          </>
        }
      />

      {study.isSample && (
        <p className="notice">
          This is an example study. The product, participants, results and findings are fictional and were
          written to demonstrate the dashboard; they are not real research.
        </p>
      )}

      <div className="metric-grid">
        <MetricCard
          label="Participants"
          value={String(overall.uniqueParticipants)}
          detail={
            participants.length > overall.uniqueParticipants
              ? `With recorded attempts · ${participants.length} registered`
              : 'With recorded attempts'
          }
        />
        <MetricCard
          label="Tasks evaluated"
          value={String(evaluatedTasks)}
          detail={`Of ${tasks.length} defined · ${overall.attempts} task attempts`}
        />
        <MetricCard
          label="Completion rate"
          value={formatPercent(overall.completionRate)}
          detail={`${overall.completed} of ${overall.attempts} attempts completed`}
        />
        <MetricCard
          label="Avg time on task"
          value={formatDuration(overall.averageTimeSeconds)}
          detail={
            successesWithoutTime > 0
              ? `From ${overall.timeSampleSize} successful attempts · ${successesWithoutTime} without a time`
              : `From ${overall.timeSampleSize} successful attempts`
          }
        />
        <MetricCard
          label="Errors recorded"
          value={hasErrorCounts ? String(overall.totalErrors) : EMPTY}
          detail={
            hasErrorCounts
              ? `${formatDecimal(overall.errorsPerAttempt, 2)} per attempt with a count`
              : 'No error counts recorded'
          }
        />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-column">
          <Card
            title="Task comparison"
            subtitle="How each task performed across all attempts"
            footnote={
              <>
                Completion rate = completed ÷ all attempts. Average time uses successful attempts only. Errors per
                attempt = errors ÷ attempts with an error count.
                {overall.missingTime + overall.missingErrors > 0 &&
                  ` Missing values excluded: ${overall.missingTime} time, ${overall.missingErrors} error count.`}
              </>
            }
          >
            <TaskComparisonChart tasks={tasks} metrics={perTask} />
          </Card>

          <Card
            title="Completed versus unsuccessful"
            subtitle="Attempts per task. Bar length shows the number of attempts."
            footnote="Based only on each attempt's recorded outcome. A missing time or error count does not make an attempt unsuccessful."
          >
            <TaskOutcomeChart tasks={tasks} metrics={perTask} />
          </Card>
        </div>

        <Card title="Key findings" subtitle={study.isSample ? 'Example findings (fictional)' : 'Synthesis'}>
          {findingEvidence.length === 0 ? (
            <EmptyState title="No findings yet">Summarise patterns once issues are logged.</EmptyState>
          ) : (
            <ol className="stack-list">
              {findingEvidence.map(({ finding, supporting, missingIssueIds }) => (
                <li key={finding.id}>
                  <span className="item-title">{finding.title}</span>
                  <span className="item-text">{finding.detail}</span>
                  <div className="evidence-block">
                    <span className="evidence-heading">
                      {supporting.length === 0
                        ? 'No supporting issues linked'
                        : `Supporting ${supporting.length === 1 ? 'issue' : 'issues'} (${supporting.length})`}
                    </span>
                    {supporting.length > 0 && (
                      <ul className="evidence-list">
                        {supporting.map(({ issue, priority }) => (
                          <li key={issue.id}>
                            <a className="evidence-link" href={recordHref('issues', issue.id)}>
                              {issue.title}
                            </a>
                            <div className="item-meta">
                              <PriorityBadge level={priority.level} />
                              <IssueStatusBadge status={issue.status} />
                            </div>
                            <span className="evidence-part">
                              <strong>Recorded evidence:</strong> {issue.evidence || 'None recorded'}
                            </span>
                            {issue.recommendation ? (
                              <span className="evidence-part">
                                <strong>Recommendation:</strong>{' '}
                                <a href={recordHref('recommendations', issue.id)}>{issue.recommendation}</a>
                              </span>
                            ) : (
                              <span className="evidence-part">
                                <strong>Recommendation:</strong> None recorded
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {missingIssueIds.length > 0 && (
                      <span className="evidence-part">
                        {missingIssueIds.length} cited {missingIssueIds.length === 1 ? 'issue no longer exists' : 'issues no longer exist'}.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card
        title="Prioritised usability issues"
        subtitle="Open and in-progress issues, highest priority first"
        actions={<a href={pageHref('issues')}>View all issues</a>}
        footnote="Priority score = severity rating (1–4) × share of participants who attempted the task and hit the issue. Severity is an evaluator's judgement, so treat the score as a triage aid, not a measurement."
      >
        {ranked.length === 0 ? (
          <EmptyState title="No open issues">Log usability issues to see them prioritised here.</EmptyState>
        ) : (
          <ol className="stack-list">
            {ranked.slice(0, TOP_ISSUE_COUNT).map(({ issue, priority }) => (
              <li key={issue.id}>
                <div className="item-title-row">
                  <a className="item-title" href={recordHref('issues', issue.id)}>
                    {issue.title}
                  </a>
                  <PriorityBadge level={priority.level} />
                </div>
                <div className="item-meta">
                  <SeverityBadge severity={issue.severity} />
                  <span>{issue.taskId ? (taskCode.get(issue.taskId) ?? 'Deleted task') : 'Whole product'}</span>
                  <span>
                    Affected {priority.affected} of {priority.denominator} participants
                  </span>
                  <span>Score {formatDecimal(priority.score, 2)} / 4</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
