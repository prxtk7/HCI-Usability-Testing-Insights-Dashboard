// Horizontal bar chart comparing tasks on one metric at a time.
// One metric per view keeps a single, honest scale (no mixed units on one axis).

import { useState } from 'react';
import type { Task } from '../types';
import type { TaskMetrics } from '../lib/metrics';
import { formatDecimal, formatDuration, formatPercent } from '../lib/format';
import { EmptyState } from './ui';

type MetricKey = 'completion' | 'time' | 'errors';

interface MetricOption {
  key: MetricKey;
  label: string;
  value: (m: TaskMetrics) => number | null;
  format: (value: number | null) => string;
  basis: (m: TaskMetrics) => string;
  /** Why the value cannot be calculated. Shown instead of a misleading zero. */
  unavailable: (m: TaskMetrics) => string;
  /** One line saying what the bars show, with units. */
  caption: (formattedMax: string) => string;
  /** Fixed maximum for the scale, or null to use the largest value. */
  fixedMax: number | null;
}

const OPTIONS: MetricOption[] = [
  {
    key: 'completion',
    label: 'Completion rate',
    value: (m) => m.completionRate,
    format: formatPercent,
    basis: (m) => `${m.completed} of ${m.attempts} attempts`,
    unavailable: () => 'no attempts',
    caption: () => 'Percentage of attempts completed. A full bar is 100%.',
    fixedMax: 1,
  },
  {
    key: 'time',
    label: 'Avg time',
    value: (m) => m.averageTimeSeconds,
    format: formatDuration,
    basis: (m) => `n = ${m.timeSampleSize} timed successes`,
    unavailable: (m) =>
      m.attempts === 0 ? 'no attempts' : m.completed === 0 ? 'no successful attempts' : 'no times recorded',
    caption: (max) => `Minutes and seconds, successful attempts only. Longest bar is ${max}.`,
    fixedMax: null,
  },
  {
    key: 'errors',
    label: 'Errors / attempt',
    value: (m) => m.errorsPerAttempt,
    format: (v) => formatDecimal(v, 2),
    basis: (m) => {
      const counted = m.attempts - m.missingErrors;
      return `${m.totalErrors} ${m.totalErrors === 1 ? 'error' : 'errors'} in ${counted} ${counted === 1 ? 'attempt' : 'attempts'}`;
    },
    unavailable: (m) => (m.attempts === 0 ? 'no attempts' : 'no error counts recorded'),
    caption: (max) => `Average errors per attempt with a count. Longest bar is ${max}.`,
    fixedMax: null,
  },
];

interface Props {
  tasks: Task[];
  metrics: TaskMetrics[];
}

export function TaskComparisonChart({ tasks, metrics }: Props) {
  const [metricKey, setMetricKey] = useState<MetricKey>('completion');
  const option = OPTIONS.find((o) => o.key === metricKey) ?? OPTIONS[0]!;

  if (tasks.length === 0) {
    return <EmptyState title="No tasks yet">Add tasks to the study to compare their performance.</EmptyState>;
  }

  const values = metrics.map(option.value);
  const largest = Math.max(0, ...values.filter((v): v is number => v !== null));
  const scaleMax = option.fixedMax ?? largest;

  return (
    <div className="chart">
      <div className="segmented" role="group" aria-label="Metric shown in chart">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={o.key === metricKey}
            onClick={() => setMetricKey(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="chart-caption">{option.caption(option.format(largest))}</p>

      <ul className="bar-chart" aria-label={`${option.label} by task`}>
        {tasks.map((task, i) => {
          const m = metrics[i];
          if (!m) return null;
          const value = values[i] ?? null;
          const width = value === null || scaleMax <= 0 ? 0 : (value / scaleMax) * 100;
          const formatted = value === null ? 'Not available' : option.format(value);
          const detail = value === null ? option.unavailable(m) : option.basis(m);
          return (
            <li key={task.id} className="bar-row" title={`${task.code} ${task.name}: ${formatted} (${detail})`}>
              <span className="bar-label">
                <span className="bar-label-code">{task.code}</span>
                <span>{task.name}</span>
              </span>
              <span className="bar-track" aria-hidden="true">
                {width > 0 && <span className="bar-fill" style={{ width: `${width}%` }} />}
              </span>
              <span className="bar-value">
                {formatted}
                <small>{detail}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
