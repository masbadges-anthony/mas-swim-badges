// A4-landscape printable certificate. Two-layer:
//   (1) BACKGROUND: the per-level artwork PNG (real artwork). Path convention:
//       /artwork/certificate-<level>.png  (e.g. certificate-starfish.png).
//       Place the files in /public/artwork/ in the repo; Vite serves them from /.
//   (2) OVERLAY: five personalization slots positioned in the empty areas of the
//       artwork:
//         · Serial No.       (top-right block, next to "Serial No." label)
//         · Date             (top-right block, next to "Date" label)
//         · Student name     (main ruled line under "This is to certify that")
//         · Instructor name  (bottom-left signature line, above "Instructor")
//         · Examiner name    (second bottom signature line, above "Assessed by")
// Coordinates are percentages of the 297×210 mm page so they scale correctly on
// screen and in print. Tweak the constants below if artwork positions shift.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

// Real artwork path. When you upload the 7 files to /public/artwork/, this
// resolves at runtime (e.g. /artwork/certificate-starfish.png). Falls back to
// the starfish placeholder path if the level isn't recognised.
function artworkUrlFor(level: string): string {
  const key = LEVEL_LABEL[level] ? level : 'starfish';
  return `/artwork/certificate-${key}.png`;
}

const CSS = `
.mas-cert-screen { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:1.5rem 1rem; }
.mas-cert-toolbar { display:flex; gap:0.6rem; }
.mas-cert-print { font:inherit; font-weight:700; cursor:pointer; border:none; border-radius:8px; background:#1E2752; color:#fff; padding:0.55rem 1.2rem; }
.mas-cert-back { font:inherit; cursor:pointer; border:1px solid #d7deea; border-radius:8px; background:#fff; color:#1E2752; padding:0.55rem 1rem; }

/* A4 landscape: 297mm × 210mm. All overlay coordinates are % of these dims. */
.mas-cert {
  position:relative;
  width:297mm; height:210mm;
  background:#fff;
  box-shadow:0 2px 14px rgba(10,31,68,0.14);
  overflow:hidden;
  font-family:'Nunito Sans', Arial, sans-serif;
  color:#1E2752;
}
.mas-cert-bg { position:absolute; inset:0; width:100%; height:100%; z-index:0; display:block; }

/* Overlay slots — absolute positioning, percentages of the page. */
.mas-cert-slot { position:absolute; z-index:1; color:#1E2752; }
.mas-cert-slot.value-top { font-size:11pt; font-weight:600; }
.mas-cert-slot.name {
  font-family:'Barlow Condensed', Arial, sans-serif;
  font-size:28pt; font-weight:700;
  text-align:center; width:56%;
}
.mas-cert-slot.signee {
  font-size:12pt; font-weight:700;
  text-align:left; width:16%;
}

/* Serial No. — right of "Serial No." label at top right */
.mas-cert-slot.slot-serial { top:5.7%;  right:2.5%; }
/* Date — right of "Date" label at top right */
.mas-cert-slot.slot-date   { top:9.0%;  right:2.5%; }
/* Student name — sits on the ruled underline under "This is to certify that" */
.mas-cert-slot.slot-name   { top:36.5%; left:32%; }
/* Instructor name — above the "Instructor / Certifying centre" line, bottom-left */
.mas-cert-slot.slot-inst   { bottom:12.5%; left:33%; }
/* Examiner name — above the "Assessed by / Certified assessor" line */
.mas-cert-slot.slot-exam   { bottom:12.5%; left:49.5%; }

@media print {
  @page { size: A4 landscape; margin: 0; }
  body * { visibility:hidden; }
  .mas-cert, .mas-cert * { visibility:visible; }
  .mas-cert { position:absolute; left:0; top:0; box-shadow:none; }
  .mas-cert-toolbar, .mas-cert-back, .mas-cert-print { display:none !important; }
}
`;

export default function PrintableCertificate() {
  const { serial } = useParams<{ serial: string }>();
  const [doc, setDoc] = useState<CertDoc | null>(null);
  const [load, setLoad] = useState<Load>('loading');

  const fetchDoc = useCallback(async () => {
    if (!serial) { setLoad('error'); return; }
    setLoad('loading');
    const { data, error } = await supabase.rpc('get_certificate_document', { _serial: serial });
    if (error || !data) { setLoad('error'); return; }
    setDoc(data as CertDoc);
    setLoad('ready');
  }, [serial]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <div className="mas-cert-screen">
        <div className="mas-cert-toolbar">
          <button className="mas-cert-back" onClick={() => window.history.back()}>← Back</button>
          {load === 'ready' && (
            <button className="mas-cert-print" onClick={() => window.print()}>Print / Save as PDF</button>
          )}
        </div>

        {load === 'loading' && <p className="mas-status">Loading…</p>}
        {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load this certificate.</p>}

        {load === 'ready' && doc && (
          <div className="mas-cert" role="document" aria-label={`Certificate ${doc.serial}`}>
            {/* Background artwork (per level) */}
            <img className="mas-cert-bg" src={artworkUrlFor(doc.level)} alt="" />

            {/* Overlay slots */}
            <div className="mas-cert-slot value-top slot-serial">{doc.serial}</div>
            <div className="mas-cert-slot value-top slot-date">{prettyDate(doc.issued_on)}</div>
            <div className="mas-cert-slot name slot-name">{doc.candidate_name}</div>
            <div className="mas-cert-slot signee slot-inst">
              {doc.instructor_name || '—'}
            </div>
            <div className="mas-cert-slot signee slot-exam">
              {doc.examiner_name || '—'}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
