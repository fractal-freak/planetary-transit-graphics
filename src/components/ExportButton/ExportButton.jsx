import styles from './ExportButton.module.css';

export default function ExportButton({ canvasRef }) {
  function handleExport() {
    const api = canvasRef.current;
    if (!api) return;

    const dataURL = api.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `planetary-transits-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <button className={styles.exportBtn} onClick={handleExport} title="Export as PNG">
      <span className={styles.icon}>↓</span>
      <span>Export PNG</span>
    </button>
  );
}
