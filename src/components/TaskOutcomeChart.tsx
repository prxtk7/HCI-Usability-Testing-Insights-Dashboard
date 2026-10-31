// Horizontal stacked bars: completed versus unsuccessful attempts for each task.
// Outcomes are told apart by symbol and text as well as colour.

import type { Task } from '../types';
import type { TaskMetrics } from '../lib/metrics';
import { summarizeOutcomes } from '../lib/metrics';
import { formatPercent } from '../lib/format';
import { EmptyState } from './ui';

interface Props {
  tasks: Task[];
  metrics: TaskMetrics[];
}

export function TaskOutcomeChart({ tasks, metrics }: Props) {
  if (tasks.length === 0) {
    return <EmptyState title="No tasks yet">Add tasks to the study to compare their outcomes.</EmptyState>;
  }

  const outcomes = summarizeOutcomes(metrics);

  return (
    <div className="chart">
      <ul className="chart-legend" aria-label="Legend">
        <li>
          <span className="legend-swatch legend-swatch-completed" aria-hidden="true" />✓ Completed
        </li>
        <li>
          <span className="legend-swatch legend-swatch-unsuccessful" aria-hidden="true" />✕ Unsuccessful
        </li>
      </ul>

      <ul className="bar-chart" aria-label="Completed and unsuccessful attempts by task">
        {tasks.map((task, i) => {
          const o = outcomes[i];
          if (!o) return null;
          const summary =
            o.attempts === 0
              ? 'no attempts recorded'
              : `${o.completed} completed, ${o.unsuccessful} unsuccessful, ${formatPercent(o.completionRate)} completion rate`;
          return (
            <li key={task.id} className="bar-row" title={`${task.code} ${task.name}: ${summary}`}>
              <span className="bar-label">
                <span className="bar-label-code">{task.code}</span>
                <span>{task.name}</span>
              </span>
              <span className="bar-track stacked-track" aria-hidden="true">
                {o.completed > 0 && <span className="stacked-completed" style={{ width: `${o.completedWidth}%` }} />}
                {o.unsuccessful > 0 && <span className="stacked-unsuccessful" style={{ width: `${o.unsuccessfulWidth}%` }} />}
              </span>
              <span className="visually-hidden">{summary}</span>
              {o.attempts === 0 ? (
                <span className="bar-value" aria-hidden="true">
                  Not available
                  <small>no attempts</small>
                </span>
              ) : (
                <span className="bar-value" aria-hidden="true">
                  {formatPercent(o.completionRate)} completed
                  <small>
                    ✓ {o.completed} · ✕ {o.unsuccessful} of {o.attempts}
                  </small>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
