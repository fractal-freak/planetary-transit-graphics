import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveProject,
  deleteProject,
  renameProject,
  updateProjectCharts,
} from '../../firebase/firestore';
import ProjectChartPickerModal from './ProjectChartPickerModal';
import styles from './ProjectPickerModal.module.css';

/**
 * Modal for managing research projects.
 * Lists existing projects, allows creating new ones (which opens
 * the chart picker), renaming, and deleting.
 */
export default function ProjectPickerModal({
  open,
  onClose,
  onSelectProject,
  activeProjectId,
  initialCreate = false,
}) {
  const { user, savedCharts, savedProjects, setSavedProjects } = useAuth();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [pendingProject, setPendingProject] = useState(null);

  const overlayRef = useRef(null);
  const createInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIsCreating(initialCreate);
      setNewName('');
      setEditingId(null);
      setDeletingId(null);
    }
  }, [open, initialCreate]);

  useEffect(() => {
    if (isCreating) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [isCreating]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    if (user) {
      const id = await saveProject(user.uid, { name, chartIds: [] });
      const project = { id, name, chartIds: [] };
      setSavedProjects(prev => [project, ...prev]);
      setPendingProject(project);
    } else {
      const project = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        chartIds: [],
      };
      setPendingProject(project);
    }

    setNewName('');
    setIsCreating(false);
    setChartPickerOpen(true);
  }

  function handleChartPickerConfirm(chartIds) {
    if (!pendingProject) return;

    const project = { ...pendingProject, chartIds };

    if (user) {
      updateProjectCharts(user.uid, project.id, chartIds);
      setSavedProjects(prev =>
        prev.map(p => p.id === project.id ? { ...p, chartIds } : p)
      );
    }

    // Resolve chart objects and select the project
    const charts = chartIds
      .map(id => savedCharts.find(c => c.id === id))
      .filter(Boolean);

    onSelectProject({ ...project, charts });
    setPendingProject(null);
    onClose();
  }

  function handleLoadProject(project) {
    const charts = project.chartIds
      .map(id => savedCharts.find(c => c.id === id))
      .filter(Boolean);
    onSelectProject({ ...project, charts });
    onClose();
  }

  function handleEditProject(project) {
    setPendingProject(project);
    setChartPickerOpen(true);
  }

  async function handleRename(projectId) {
    const name = editName.trim();
    if (!name) return;

    if (user) {
      await renameProject(user.uid, projectId, name);
    }
    setSavedProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, name } : p)
    );
    setEditingId(null);
    setEditName('');
  }

  async function handleDelete(projectId) {
    if (user) {
      await deleteProject(user.uid, projectId);
    }
    setSavedProjects(prev => prev.filter(p => p.id !== projectId));
    setDeletingId(null);
  }

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
        <div className={styles.modal}>
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.title}>Research Projects</span>
            <button className={styles.closeBtn} onClick={onClose}>{'\u00D7'}</button>
          </div>

          {/* Body */}
          <div className={styles.body}>
            {savedProjects.length === 0 ? (
              <div className={styles.empty}>
                No projects yet. Create one to organize your chart research.
              </div>
            ) : (
              savedProjects.map(project => {
                const isActive = project.id === activeProjectId;

                // Renaming
                if (editingId === project.id) {
                  return (
                    <div key={project.id} className={styles.inlineEdit}>
                      <input
                        className={styles.inlineInput}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(project.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                      />
                      <div className={styles.inlineActions}>
                        <button className={styles.inlineBtn} onClick={() => handleRename(project.id)}>Save</button>
                        <button className={styles.inlineBtn} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                // Deleting
                if (deletingId === project.id) {
                  return (
                    <div key={project.id} className={styles.inlineEdit}>
                      <span className={styles.deleteText}>Delete "{project.name}"?</span>
                      <div className={styles.inlineActions}>
                        <button
                          className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`}
                          onClick={() => handleDelete(project.id)}
                        >
                          Delete
                        </button>
                        <button className={styles.inlineBtn} onClick={() => setDeletingId(null)}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={project.id}
                    className={`${styles.projectItem} ${isActive ? styles.projectItemActive : ''}`}
                  >
                    <button className={styles.projectBtn} onClick={() => handleLoadProject(project)}>
                      <span className={styles.projectName}>
                        {project.name}
                        {isActive && <span style={{ fontSize: '10px', color: 'rgba(80, 144, 224, 0.7)', marginLeft: '6px' }}>{'\u25CF'} Active</span>}
                      </span>
                      <span className={styles.projectMeta}>
                        {project.chartIds.length} chart{project.chartIds.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    <div className={styles.projectActions}>
                      <button
                        className={styles.projectActionBtn}
                        onClick={() => handleEditProject(project)}
                        title="Edit charts"
                      >
                        {'\u270E'}
                      </button>
                      <button
                        className={styles.projectActionBtn}
                        onClick={() => {
                          setEditingId(project.id);
                          setEditName(project.name);
                        }}
                        title="Rename"
                      >
                        Aa
                      </button>
                      <button
                        className={styles.projectActionBtn}
                        onClick={() => setDeletingId(project.id)}
                        title="Delete"
                      >
                        {'\u00D7'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            {isCreating ? (
              <div className={styles.createRow}>
                <input
                  ref={createInputRef}
                  className={styles.createInput}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Project name..."
                />
                <button
                  className={`${styles.footerBtn} ${styles.footerBtnPrimary}`}
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  style={{ flex: 0, padding: '7px 14px' }}
                >
                  Create
                </button>
                <button
                  className={styles.footerBtn}
                  onClick={() => { setIsCreating(false); setNewName(''); }}
                  style={{ flex: 0, padding: '7px 10px' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className={styles.footerBtn}
                onClick={() => setIsCreating(true)}
              >
                + New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chart picker for new/edit project */}
      <ProjectChartPickerModal
        open={chartPickerOpen}
        onClose={() => {
          setChartPickerOpen(false);
          setPendingProject(null);
        }}
        onConfirm={handleChartPickerConfirm}
        initialSelectedIds={pendingProject?.chartIds || []}
        title={pendingProject?.name ? `Charts for "${pendingProject.name}"` : 'Select Charts'}
      />
    </>
  );
}
