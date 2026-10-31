import type { StudyData } from '../types';
import { buildRecommendations } from '../lib/recommendations';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { IssueStatusBadge, PriorityBadge } from '../components/badges';
import { recordHref, useLinkedRecord } from '../navigation';

export function RecommendationsPage({ data }: { data: StudyData }) {
  const { study } = data;
  const ranked = buildRecommendations(data);
  const linkedId = useLinkedRecord('recommendation-record-');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Recommendations"
        title="Design recommendations"
        lede="Each recommendation comes from a logged issue, so you can trace it back to its evidence."
      />

      <Card
        title="Recommended changes"
        subtitle={study.isSample ? 'Example recommendations for a fictional study' : 'Ordered by issue priority'}
        footnote="Each recommendation is a proposed design change written on an issue. Edit it from the Issues page."
      >
        {ranked.length === 0 ? (
          <EmptyState title="No recommendations yet">Add a recommendation to an issue to see it here.</EmptyState>
        ) : (
          <ol className="stack-list">
            {ranked.map(({ issue, priority, findingTitles }) => (
              <li
                key={issue.id}
                id={`recommendation-record-${issue.id}`}
                tabIndex={-1}
                className={issue.id === linkedId ? 'linked-record' : undefined}
              >
                <div className="item-title-row">
                  <span className="item-title">{issue.recommendation}</span>
                  <PriorityBadge level={priority.level} />
                </div>
                <div className="item-meta">
                  <span>
                    Addresses issue: <a href={recordHref('issues', issue.id)}>{issue.title}</a>
                  </span>
                  {findingTitles.map((title) => (
                    <span key={title}>Finding: {title}</span>
                  ))}
                  <IssueStatusBadge status={issue.status} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
