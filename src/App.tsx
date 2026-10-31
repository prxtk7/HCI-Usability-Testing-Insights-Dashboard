import { useSyncExternalStore } from 'react';
import type { StudyData } from './types';
import type { StudyState, StudyStore } from './lib/studyStore';
import { pageHref, useCurrentPage, type PageId } from './navigation';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { StudyPage } from './pages/StudyPage';
import { SessionsPage } from './pages/SessionsPage';
import { IssuesPage } from './pages/IssuesPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { DataPage } from './pages/DataPage';

/** Re-renders the component whenever the store's state changes. */
function useStudyStore(store: StudyStore): StudyState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

function renderPage(page: PageId, data: StudyData, state: StudyState, store: StudyStore) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage data={data} />;
    case 'study':
      return <StudyPage data={data} onChange={(next) => store.update(() => next)} />;
    case 'sessions':
      return <SessionsPage data={data} onChange={(next) => store.update(() => next)} />;
    case 'issues':
      return <IssuesPage data={data} onChange={(next) => store.update(() => next)} />;
    case 'recommendations':
      return <RecommendationsPage data={data} />;
    case 'data':
      return <DataPage state={state} onRestoreSample={store.restoreSample} onImport={store.importStudy} />;
  }
}

/** Shown on every page when saving is not working normally. */
function StorageAlert({ state, page }: { state: StudyState; page: PageId }) {
  let message: string | null = null;
  if (state.loadProblem) {
    message = `Your saved study could not be loaded. ${state.loadProblem.message} It has been left untouched, the sample study is shown instead, and changes are not being saved.`;
  } else if (state.storageWarning) {
    message = state.storageWarning;
  }
  if (!message) return null;

  return (
    <div className="page app-alert">
      <p className="notice notice-warning" role="alert">
        {message}{' '}
        {page !== 'data' && <a href={pageHref('data')}>Review options in Export &amp; data</a>}
      </p>
    </div>
  );
}

export function App({ store }: { store: StudyStore }) {
  // All study data lives in `store`. Pages receive it as props and,
  // once editing exists, will change it through `store.update`.
  const state = useStudyStore(store);
  const page = useCurrentPage();

  return (
    <Layout currentPage={page}>
      <StorageAlert state={state} page={page} />
      {renderPage(page, state.data, state, store)}
    </Layout>
  );
}
