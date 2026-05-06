import { useState } from 'react';
import { PLANET_MAP } from '../../data/planets';
import { ASPECT_MAP } from '../../utils/aspects';
import styles from './Controls.module.css';

/**
 * NotesSection — list + manage transit notes for the active natal chart.
 *
 * Each note row shows the transit pair (e.g. ♂ ☍ ♅), the peak date, and the
 * first line of the note body. Clicking the row expands it to read the full
 * body. Each row exposes two actions: "Add" (append the transit to current
 * natal jobs) and "Load" (replace all current jobs with just that transit).
 */
export default function NotesSection({
  notes,
  onAddTransit,
  onLoadTransit,
  onDeleteNote,
  onSaveNote,
  hasChart,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!hasChart) {
    return (
      <div className={styles.notesEmpty}>
        Create or load a chart to attach notes to transits.
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return (
      <div className={styles.notesEmpty}>
        Click a transit on the timeline to add a note. Saved notes show up here.
      </div>
    );
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditBody(note.body || '');
    setExpandedId(note.id);
  }

  async function commitEdit(note) {
    await onSaveNote(
      {
        transitPlanet: note.transitPlanet,
        target: note.target,
        aspect: note.aspect,
        peakDate: note.peakDate,
        body: editBody,
        createdAt: note.createdAt,
      },
      note.id,
    );
    setEditingId(null);
    setEditBody('');
  }

  return (
    <div className={styles.notesList}>
      {notes.map(note => {
        const tP = PLANET_MAP[note.transitPlanet];
        const targetP = PLANET_MAP[note.target];
        const aspect = ASPECT_MAP[note.aspect];
        const expanded = expandedId === note.id;
        const editing = editingId === note.id;
        const peakDate = note.peakDate ? new Date(note.peakDate) : null;
        const peakDateStr = peakDate
          ? peakDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : '';

        return (
          <div
            key={note.id}
            className={`${styles.notesItem} ${expanded ? styles.notesItemOpen : ''}`}
          >
            <button
              className={styles.notesItemHeader}
              onClick={() => setExpandedId(expanded ? null : note.id)}
            >
              <span className={styles.notesGlyphs}>
                <span style={{ color: tP?.color }}>{tP?.symbol ?? note.transitPlanet}</span>
                <span className={styles.notesAspect}>{aspect?.symbol ?? note.aspect}</span>
                <span style={{ color: targetP?.color }}>{targetP?.symbol ?? note.target}</span>
              </span>
              {peakDateStr && <span className={styles.notesDate}>{peakDateStr}</span>}
              {!editing && note.body && (
                <span className={styles.notesPreview}>
                  {note.body.length > 40 ? note.body.slice(0, 40) + '…' : note.body}
                </span>
              )}
            </button>

            {expanded && (
              <div className={styles.notesBody}>
                {editing ? (
                  <>
                    <textarea
                      className={styles.notesTextarea}
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      placeholder="Note…"
                      autoFocus
                    />
                    <div className={styles.notesActions}>
                      <button
                        className={`${styles.notesBtn} ${styles.notesBtnPrimary}`}
                        onClick={() => commitEdit(note)}
                      >Save</button>
                      <button
                        className={styles.notesBtn}
                        onClick={() => { setEditingId(null); setEditBody(''); }}
                      >Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    {note.body
                      ? <div className={styles.notesText}>{note.body}</div>
                      : <div className={styles.notesEmptyBody}>No body — click Edit to add one.</div>
                    }
                    <div className={styles.notesActions}>
                      <button
                        className={`${styles.notesBtn} ${styles.notesBtnPrimary}`}
                        onClick={() => onAddTransit(note)}
                        title="Append this transit to the current timeline"
                      >Add</button>
                      <button
                        className={styles.notesBtn}
                        onClick={() => onLoadTransit(note)}
                        title="Replace all current transits with just this one"
                      >Load</button>
                      <span className={styles.notesActionSpacer} />
                      <button className={styles.notesBtn} onClick={() => startEdit(note)}>Edit</button>
                      {confirmDeleteId === note.id ? (
                        <>
                          <button
                            className={`${styles.notesBtn} ${styles.notesBtnDanger}`}
                            onClick={() => { onDeleteNote(note.id); setConfirmDeleteId(null); }}
                          >Confirm</button>
                          <button
                            className={styles.notesBtn}
                            onClick={() => setConfirmDeleteId(null)}
                          >Cancel</button>
                        </>
                      ) : (
                        <button
                          className={styles.notesBtn}
                          onClick={() => setConfirmDeleteId(note.id)}
                        >Delete</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
