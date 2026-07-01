// A4-landscape printable certificate. Two-layer:
//   (1) BACKGROUND: per-level artwork PNG at /artwork/certificate-<level>.png.
//   (2) OVERLAY: five personalization slots:
//         · Serial No.       (top-right)
//         · Date             (top-right, below serial)
//         · Student name     (main ruled line, centre)
//         · Instructor name  (bottom-left signature line)
//         · Examiner name    (bottom, next to instructor)
//
// Two output paths from the same overlay coordinates so the on-screen preview and
// the downloadable PDF always match:
//   - PREVIEW (HTML) — the browser page you see; Print button uses window.print().
//   - PDF (jsPDF client-side) — Download PDF button generates a real .pdf file
//     without a browser dialog. Uses Helvetica (jsPDF's built-in); brand fonts
//     can be added later if desired.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';

type Load = 'loading' | 'ready' | 'error';

interface CertDoc {
  serial: string;
  level: string;
  issued_on: string | null;
  candidate_name: string;
  centre_name: string | null;
  instructor_name: string | null;
  examiner_name: string | null;
  issued_by_name: string | null;
}

const LEVEL_LABEL: Record<string, string> = {
  starfish: 'Starfish', sea_turtle: 'Sea Turtle', guppy: 'Guppy', octopus: 'Octopus',
  frog: 'Frog', swordfish: 'Swordfish', dolphin: 'Dolphin',
};

function prettyDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function artworkUrlFor(level: string): string {
  const key = LEVEL_LABEL[level] ? level : 'starfish';
  return `/artwork/certificate-${key}.png`;
}

// A4 landscape page dimensions in mm.
const PAGE_W = 297;
const PAGE_H = 210;

// Single source of truth for overlay coordinates (percentages of page).
// Kept identical between the HTML preview and the PDF generator.
const SLOT = {
  // top-right corner block, beside "Serial No." / "Date" labels
  serial: { xPct: 97.5, yPct: 3.5, align: 'right' as const, size: 9,  weight: 'normal' as const },
  date:   { xPct: 97.5, yPct: 5.5, align: 'right' as const, size: 11, weight: 'normal' as const },
  // student name on the ruled line under "This is to certify that", left-of-centre
  name:   { xPct: 42.0, yPct: 33.5, align: 'left' as const, size: 24, weight: 'bold' as const, maxWidthMm: 140, minSize: 14 },
  // signature lines at bottom — instructor + examiner, above their labels
  inst:   { xPct: 37.0, yPct: 89.0, align: 'left' as const, size: 12, weight: 'bold' as const },
  exam:   { xPct: 56.0, yPct: 89.0, align: 'left' as const, size: 12, weight: 'bold' as const },
};

function mmX(pct: number) { return (pct / 100) * PAGE_W; }
function mmY(pct: number) { return (pct / 100) * PAGE_H; }

async function loadImageAsDataUrl(src: string): Promise<string> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`artwork not found: ${src}`);
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

async function generatePdf(doc: CertDoc): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Background artwork — full page.
  const bgUrl = artworkUrlFor(doc.level);
  const bgData = await loadImageAsDataUrl(bgUrl);
  pdf.addImage(bgData, 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');

  // Overlays. Use built-in Helvetica; navy fill matches theme.
  pdf.setTextColor(30, 39, 82); // #1E2752

  const draw = (
    text: string,
    slot: { xPct: number; yPct: number; align: 'left' | 'center' | 'right'; size: number; weight: 'normal' | 'bold'; maxWidthMm?: number; minSize?: number },
  ) => {
    pdf.setFont('helvetica', slot.weight);
    // Auto-shrink to fit if maxWidthMm is set; step down 1pt at a time to minSize (default 12).
    let sz = slot.size;
    const minSz = slot.minSize ?? 12;
    pdf.setFontSize(sz);
    if (slot.maxWidthMm != null) {
      while (sz > minSz && pdf.getTextWidth(text) > slot.maxWidthMm) {
        sz -= 1;
        pdf.setFontSize(sz);
      }
    }
    pdf.text(text, mmX(slot.xPct), mmY(slot.yPct), { align: slot.align });
  };

  draw(doc.serial, SLOT.serial);
  draw(prettyDate(doc.issued_on), SLOT.date);
  draw(doc.candidate_name, SLOT.name);
  draw(doc.instructor_name || '—', SLOT.inst);
  draw(doc.examiner_name || '—', SLOT.exam);

  return pdf.output('blob');
}

function pdfFilename(doc: CertDoc): string {
  const first = (doc.candidate_name || 'certificate').split(/\s+/)[0].replace(/[^A-Za-z0-9-]/g, '');
  return `MAS-Certificate-${doc.serial}-${first}.pdf`;
}

const CSS = `
.mas-cert-screen { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:1.5rem 1rem; }
.mas-cert-toolbar { display:flex; gap:0.6rem; flex-wrap:wrap; }
.mas-cert-print, .mas-cert-download { font:inherit; font-weight:700; cursor:pointer; border:none; border-radius:8px; background:#1E2752; color:#fff; padding:0.55rem 1.2rem; }
.mas-cert-download { background:#C62026; }
.mas-cert-back { font:inherit; cursor:pointer; border:1px solid #d7deea; border-radius:8px; background:#fff; color:#1E2752; padding:0.55rem 1rem; }
.mas-cert-download:disabled { opacity:0.6; cursor:progress; }

.mas-cert {
  position:relative;
  width:297mm; height:210mm;
  background:#fff;
  box-shadow:0 2px 14px rgba(10,31,68,0.14);
  overflow:hidden;
  font-family: Helvetica, Arial, sans-serif;
  color:#1E2752;
}
.mas-cert-bg { position:absolute; inset:0; width:100%; height:100%; z-index:0; display:block; }

.mas-cert-slot { position:absolute; z-index:1; color:#1E2752; white-space:nowrap; line-height:1; }
.mas-cert-slot.value-top { font-size:11pt; }
.mas-cert-slot.name { font-size:24pt; font-weight:700; max-width:140mm; text-align:left; }
.mas-cert-slot.name[data-len="long"]  { font-size:20pt; }
.mas-cert-slot.name[data-len="xlong"] { font-size:17pt; }
.mas-cert-slot.name[data-len="xxlong"]{ font-size:14pt; }
.mas-cert-slot.signee { font-size:12pt; font-weight:700; text-align:left; }

/* Coordinates below MUST match SLOT above. Percentages of the page. */
/* Right-anchored (transform lifts the baseline visually the same as jsPDF's 'right' align) */
.mas-cert-slot.slot-serial { top: 3.5%;  right: 2.5%; font-size: 9pt; }
.mas-cert-slot.slot-date   { top: 5.5%;  right: 2.5%; }
/* Centre-anchored name — sits on the ruled line under "This is to certify that" */
.mas-cert-slot.slot-name   { top: 33.5%; left: 42.0%; transform: translateY(-50%); }
/* Left-anchored signee names above their labels at bottom */
.mas-cert-slot.slot-inst   { top: 89.0%; left: 37.0%; transform: translateY(-50%); }
.mas-cert-slot.slot-exam   { top: 89.0%; left: 56.0%; transform: translateY(-50%); }

@media print {
  @page { size: A4 landscape; margin: 0; }
  body * { visibility:hidden; }
  .mas-cert, .mas-cert * { visibility:visible; }
  .mas-cert { position:absolute; left:0; top:0; box-shadow:none; }
  .mas-cert-toolbar, .mas-cert-back, .mas-cert-print, .mas-cert-download { display:none !important; }
}
`;

export default function PrintableCertificate() {
  const { serial } = useParams<{ serial: string }>();
  const [doc, setDoc] = useState<CertDoc | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  const fetchDoc = useCallback(async () => {
    if (!serial) { setLoad('error'); return; }
    setLoad('loading');
    const { data, error } = await supabase.rpc('get_certificate_document', { _serial: serial });
    if (error || !data) { setLoad('error'); return; }
    setDoc(data as CertDoc);
    setLoad('ready');
  }, [serial]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  async function downloadPdf() {
    if (!doc) return;
    setDlError(null);
    setDownloading(true);
    try {
      const blob = await generatePdf(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename(doc);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <div className="mas-cert-screen">
        <div className="mas-cert-toolbar">
          <button className="mas-cert-back" onClick={() => window.history.back()}>← Back</button>
          {load === 'ready' && (
            <>
              <button className="mas-cert-download" onClick={downloadPdf} disabled={downloading}>
                {downloading ? 'Generating…' : 'Download PDF'}
              </button>
              <button className="mas-cert-print" onClick={() => window.print()}>Print</button>
            </>
          )}
        </div>

        {load === 'loading' && <p className="mas-status">Loading…</p>}
        {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load this certificate.</p>}
        {dlError && <p className="mas-status mas-status-bad">Couldn’t download: {dlError}</p>}

        {load === 'ready' && doc && (
          <div className="mas-cert" role="document" aria-label={`Certificate ${doc.serial}`}>
            <img className="mas-cert-bg" src={artworkUrlFor(doc.level)} alt="" />

            <div className="mas-cert-slot value-top slot-serial">{doc.serial}</div>
            <div className="mas-cert-slot value-top slot-date">{prettyDate(doc.issued_on)}</div>
            <div
              className="mas-cert-slot name slot-name"
              data-len={
                doc.candidate_name.length <= 22 ? undefined
                : doc.candidate_name.length <= 28 ? 'long'
                : doc.candidate_name.length <= 34 ? 'xlong'
                : 'xxlong'
              }
            >{doc.candidate_name}</div>
            <div className="mas-cert-slot signee slot-inst">{doc.instructor_name || '—'}</div>
            <div className="mas-cert-slot signee slot-exam">{doc.examiner_name || '—'}</div>
          </div>
        )}
      </div>
    </section>
  );
}
