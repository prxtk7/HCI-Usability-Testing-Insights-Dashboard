import { useState, type ChangeEvent } from 'react';
import type { StudyData } from '../types';
import type { ActionResult, StudyState } from '../lib/studyStore';
import { BACKUP_KEY } from '../lib/storage';
import { downloadTextFile } from '../lib/download';
import { exportAttempts, exportIssues, type ExportResult } from '../lib/exportData';
import { describeStudyContents, exportBackup, MAX_BACKUP_BYTES, parseBackup } from '../lib/backup';
import { Card, PageHeader } from '../components/ui';
import { useFocusAfterRender } from '../components/forms';

interface DataPageProps {
  state: StudyState;
  onRestoreSample: () => ActionResult;
  onImport: (data: StudyData) => ActionResult;
}

/** A backup that passed validation and is waiting for the user to confirm. */
interface PendingImport {
  fileName: string;
  exportedAt: string;
  data: StudyData;
}

const IMPORT_INPUT_ID = 'import-backup-file';
const MAX_ERRORS_SHOWN = 8;

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function SaveStatus({ state }: { state: StudyState }) {
  switch (state.saveMode) {
    case 'on':
      return (
        <p className="item-text">
          <span className="badge badge-low">Saving on</span>{' '}
          {state.lastSavedAt
            ? `Last saved ${formatSavedAt(state.lastSavedAt)}.`
            : 'Nothing saved yet. The sample study is shown until you make a change.'}
        </p>
      );
    case 'paused':
      return (
        <p className="item-text">
          <span className="badge badge-medium">Saving paused</span> Saved data could not be read, so it is
          protected from being overwritten.
        </p>
      );
    case 'off':
      return (
        <p className="item-text">
          <span className="badge badge-high">Saving unavailable</span> This browser does not allow storage
          here (for example, some private windows). Changes last only until the tab is closed.
        </p>
      );
  }
}

export function DataPage({ state, onRestoreSample, onImport }: DataPageProps) {
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [exportFeedback, setExportFeedback] = useState<ActionResult | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importFeedback, setImportFeedback] = useState<ActionResult | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const focusAfterRender = useFocusAfterRender();
  const problem = state.loadProblem;
  const { data } = state;

  function runExport(result: ExportResult, mimeType: string) {
    if (!result.ok) {
      setExportFeedback({ ok: false, message: result.message });
      return;
    }
    try {
      downloadTextFile(result.filename, result.text, mimeType);
      setExportFeedback({ ok: true, message: `Download started: ${result.filename}` });
    } catch {
      setExportFeedback({ ok: false, message: 'The browser could not create the download. Nothing was exported.' });
    }
  }

  async function chooseBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setPendingImport(null);
    setImportFeedback(null);
    setImportErrors([]);
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        setImportErrors(['This file is too large to be a backup from this app (over 5 MB).']);
        return;
      }
      const result = parseBackup(await file.text());
      if (result.ok) setPendingImport({ fileName: file.name, exportedAt: result.exportedAt, data: result.data });
      else setImportErrors(result.errors);
    } catch {
      setImportErrors(['The file could not be read. Check it still exists and try again.']);
    } finally {
      // Lets the same file be chosen again after it is corrected.
      input.value = '';
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    setImportFeedback(onImport(pendingImport.data));
    setPendingImport(null);
    focusAfterRender(IMPORT_INPUT_ID);
  }

  function cancelImport() {
    setPendingImport(null);
    setImportFeedback({ ok: true, message: 'Import cancelled. Your data was not changed.' });
    focusAfterRender(IMPORT_INPUT_ID);
  }

  function confirmRestore() {
    setFeedback(onRestoreSample());
    setConfirming(false);
  }

  function cancelRestore() {
    setConfirming(false);
    setFeedback({ ok: true, message: 'Restore cancelled. Your data was not changed.' });
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Export & data"
        title="Export and storage"
        lede="Download your study, restore it from a backup, or start again from the sample study."
      />

      <Card title="Where your data is kept">
        <p className="item-text">
          Changes are saved in this browser's <em>localStorage</em>: a small storage area private to this
          browser on this device. It is not a cloud backup, it is not shared with other people or devices, it is
          not encrypted, and clearing browser data deletes it. Do not enter real or confidential participant data.
        </p>
        <SaveStatus state={state} />
      </Card>

      {problem && (
        <Card title="Saved data needs attention">
          <p className="item-text">
            {problem.message} The app did not delete it. You can download it to inspect or repair it, then
            restore the sample study to start saving again. Restoring also keeps a copy in this browser under
            the key <span className="code">{BACKUP_KEY}</span>.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => downloadTextFile('saved-study-data.json', problem.raw, 'application/json')}
            >
              Download saved data
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Export data"
        subtitle="Files contain the study currently shown in the app. Participants appear only by ID and anonymised code."
        footnote={
          problem
            ? 'Saved data could not be read, so these exports contain the sample study shown now, not the unreadable record.'
            : undefined
        }
      >
        <ul className="export-list">
          <li className="export-row">
            <span className="export-row-text">
              <span className="item-title">Task attempts (CSV)</span>
              <span className="item-text">
                {data.attempts.length} attempts for spreadsheets. Values that were not recorded stay empty.
              </span>
            </span>
            <button type="button" className="button" onClick={() => runExport(exportAttempts(data), 'text/csv;charset=utf-8')}>
              Export task attempts
            </button>
          </li>
          <li className="export-row">
            <span className="export-row-text">
              <span className="item-title">Usability issues (CSV)</span>
              <span className="item-text">
                {data.issues.length} issues with evidence, recommendation and current priority score.
              </span>
            </span>
            <button type="button" className="button" onClick={() => runExport(exportIssues(data), 'text/csv;charset=utf-8')}>
              Export usability issues
            </button>
          </li>
          <li className="export-row">
            <span className="export-row-text">
              <span className="item-title">Complete study backup (JSON)</span>
              <span className="item-text">{describeStudyContents(data)}. Can be imported again below.</span>
            </span>
            <button type="button" className="button" onClick={() => runExport(exportBackup(data), 'application/json')}>
              Download backup
            </button>
          </li>
        </ul>
        <p className={`feedback ${exportFeedback && !exportFeedback.ok ? 'feedback-error' : ''}`} role="status">
          {exportFeedback?.message}
        </p>
      </Card>

      <Card
        title="Import study backup"
        subtitle="The file is checked in full first. Your study does not change until you confirm."
      >
        <div className="field">
          <label htmlFor={IMPORT_INPUT_ID} className="field-label">
            Backup file from this app (.json)
          </label>
          <input id={IMPORT_INPUT_ID} type="file" accept=".json,application/json" onChange={chooseBackupFile} />
        </div>

        {importErrors.length > 0 && (
          <div className="confirm-panel" role="alert">
            <p className="item-title">This backup was not imported. Your data was not changed.</p>
            <ul className="error-list">
              {importErrors.slice(0, MAX_ERRORS_SHOWN).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
            {importErrors.length > MAX_ERRORS_SHOWN && (
              <p className="item-text">And {importErrors.length - MAX_ERRORS_SHOWN} more problems.</p>
            )}
          </div>
        )}

        {pendingImport && (
          <div className="confirm-panel" role="group" aria-labelledby="import-confirm-title">
            <p id="import-confirm-title" className="item-title">
              Replace “{data.study.title}” with “{pendingImport.data.study.title}”?
            </p>
            <p className="item-text">
              The file {pendingImport.fileName}, exported {formatSavedAt(pendingImport.exportedAt)}, is valid and contains{' '}
              {describeStudyContents(pendingImport.data)}.
              {pendingImport.data.study.isSample && ' It is marked as fictional sample data.'}
            </p>
            <p className="item-text">
              Importing replaces all current study data in this browser. This cannot be undone, so download a backup of
              the current study first if you may need it.
            </p>
            <div className="button-row">
              <button type="button" className="button button-danger" onClick={confirmImport}>
                Yes, replace with this backup
              </button>
              <button type="button" className="button" onClick={cancelImport} autoFocus>
                Cancel
              </button>
              <button type="button" className="button" onClick={() => runExport(exportBackup(data), 'application/json')}>
                Download current study first
              </button>
            </div>
          </div>
        )}

        <p className={`feedback ${importFeedback && !importFeedback.ok ? 'feedback-error' : ''}`} role="status">
          {importFeedback?.message}
        </p>
      </Card>

      <Card title="Restore sample study">
        <p className="item-text">
          Replaces the study currently stored in this browser with the original fictional CampusBook sample.
          Any changes you have made will be lost.
        </p>

        {confirming ? (
          <div className="confirm-panel" role="group" aria-labelledby="restore-confirm-title">
            <p id="restore-confirm-title" className="item-title">
              Replace your current study data with the sample study?
            </p>
            <p className="item-text">This cannot be undone.</p>
            <div className="button-row">
              <button type="button" className="button button-danger" onClick={confirmRestore}>
                Yes, replace my data
              </button>
              {/* Cancel gets focus first so pressing Enter by accident is safe. */}
              <button type="button" className="button" onClick={cancelRestore} autoFocus>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => {
                setFeedback(null);
                setConfirming(true);
              }}
            >
              Restore sample study…
            </button>
          </div>
        )}

        <p className={`feedback ${feedback && !feedback.ok ? 'feedback-error' : ''}`} role="status">
          {feedback?.message}
        </p>
      </Card>
    </div>
  );
}
