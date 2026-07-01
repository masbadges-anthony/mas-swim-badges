// A4-landscape printable certificate.
//   /certificate/:serial → get_certificate_document(_serial)
//
// Two-layer design:
//   (1) BACKGROUND LAYER — the artwork per level. Currently a branded SVG
//       placeholder. When real artwork is supplied, swap the src in
//       `backgroundArtworkFor(level)` to point at the image file per level
//       (e.g. `/artwork/certificate-starfish.png`). Text overlay coordinates
//       are stable, so a like-for-like image swap keeps the overlay aligned.
//   (2) OVERLAY LAYER — swimmer's Name (large), attainment line, and a smaller
//       "Branch · Instructor" sub-line. Rendered above the background.
//
// On screen: centred A4-landscape card with a Print / Save as PDF button.
// On print: only the certificate page (background + overlay), sized to A4L.
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
  issued_by_name: string | null;
}

const LEVEL_LABEL: Record<string, string> = {
  starfish: 'Starfish', sea_turtle: 'Sea Turtle', guppy: 'Guppy', octopus: 'Octopus',
  frog: 'Frog', swordfish: 'Swordfish', dolphin: 'Dolphin',
};
const LEVEL_NUMBER: Record<string, number> = {
  starfish: 1, sea_turtle: 2, guppy: 3, octopus: 4, frog: 5, swordfish: 6, dolphin: 7,
};

function prettyDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// SWAP POINT — when real artwork is supplied per level, replace this SVG with
// something like: return <img src={`/artwork/certificate-${level}.png`} className="mas-cert-bg" />;
function BackgroundArtworkFor({ level }: { level: string }) {
  const label = LEVEL_LABEL[level] ?? level;
  const num = LEVEL_NUMBER[level] ?? 0;
  return (
    <svg
      className="mas-cert-bg"
      viewBox="0 0 1123 794"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* placeholder navy border frame */}
      <rect x="0" y="0" width="1123" height="794" fill="#ffffff" />
      <rect x="24" y="24" width="1075" height="746" fill="none" stroke="#1E2752" strokeWidth="4" />
      <rect x="40" y="40" width="1043" height="714" fill="none" stroke="#C62026" strokeWidth="1.5" />

      {/* Top masthead placeholder */}
      <text x="561.5" y="102" textAnchor="middle" fontFamily="Barlow Condensed, Arial, sans-serif"
            fontSize="34" fontWeight="800" letterSpacing="4" fill="#C62026">
        MAS BADGES
      </text>
      <text x="561.5" y="128" textAnchor="middle" fontFamily="Nunito Sans, Arial, sans-serif"
            fontSize="13" letterSpacing="4" fill="#5d6b85">
        MALAYSIA AQUATICS · LEARN-TO-SWIM
      </text>
      <line x1="431" y1="146" x2="692" y2="146" stroke="#1E2752" strokeWidth="1.5" />

      {/* Placeholder badge circle — will be replaced by level artwork */}
      <g transform="translate(561.5, 220)">
        <circle cx="0" cy="0" r="62" fill="none" stroke="#F9C610" strokeWidth="4" />
        <circle cx="0" cy="0" r="56" fill="#1E2752" />
        <text x="0" y="8" textAnchor="middle" fontFamily="Barlow Condensed, Arial, sans-serif"
              fontSize="38" fontWeight="800" fill="#F9C610">L{num}</text>
      </g>
      <text x="561.5" y="316" textAnchor="middle" fontFamily="Barlow Condensed, Arial, sans-serif"
            fontSize="22" fontWeight="700" letterSpacing="3" fill="#1E2752" textTransform="uppercase">
        {label.toUpperCase()} AWARD
      </text>

      {/* Bottom placeholder ribbon */}
      <line x1="80" y1="700" x2="1043" y2="700" stroke="#1E2752" strokeWidth="1" />
      <text x="561.5" y="732" textAnchor="middle" fontFamily="Nunito Sans, Arial, sans-serif"
            fontSize="10" letterSpacing="3" fill="#5d6b85">
        VERIFY AUTHENTICITY AT APPS.MASBADGES.ORG/VERIFY
      </text>
    </svg>
  );
}

const CSS = `
.mas-cert-screen { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:1.5rem 1rem; }
.mas-cert-toolbar { display:flex; gap:0.6rem; }
.mas-cert-print { font:inherit; font-weight:700; cursor:pointer; border:none; border-radius:8px; background:#1E2752; color:#fff; padding:0.55rem 1.2rem; }
.mas-cert-back { font:inherit; cursor:pointer; border:1px solid #d7deea; border-radius:8px; background:#fff; color:#1E2752; padding:0.55rem 1rem; }

/* A4 landscape: 297mm × 210mm */
.mas-cert {
  position:relative;
  width:297mm; height:210mm;
  background:#fff;
  box-shadow:0 2px 14px rgba(10,31,68,0.14);
  overflow:hidden;
  font-family:'Nunito Sans', Arial, sans-serif;
  color:#1E2752;
}
.mas-cert-bg { position:absolute; inset:0; width:100%; height:100%; z-index:0; }

/* Overlay layer — text sits above the background artwork. Positioning is anchored
   to the LOWER half so it works even if the artwork occupies the upper half. */
.mas-cert-overlay {
  position:absolute; inset:0; z-index:1;
  display:flex; flex-direction:column; justify-content:flex-end;
  padding: 0 40mm 34mm;
  text-align:center;
}
.mas-cert-name {
  font-family:'Barlow Condensed', Arial, sans-serif;
  font-size:48pt; font-weight:800; letter-spacing:1px;
  color:#1E2752;
  margin:0 0 6mm;
}
.mas-cert-line { font-size:14pt; margin:0 0 4mm; }
.mas-cert-line strong { color:#C62026; }
.mas-cert-sub { font-size:11pt; color:#5d6b85; margin:0; }
.mas-cert-serial { position:absolute; bottom:8mm; right:14mm; font-size:8pt; color:#5d6b85; letter-spacing:2px; }

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
            <BackgroundArtworkFor level={doc.level} />
            <div className="mas-cert-overlay">
              <h1 className="mas-cert-name">{doc.candidate_name}</h1>
              <p className="mas-cert-line">
                has attained the <strong>{LEVEL_LABEL[doc.level] ?? doc.level}</strong> award
                {' '}on <strong>{prettyDate(doc.issued_on)}</strong>
              </p>
              <p className="mas-cert-sub">
                {doc.centre_name ? `${doc.centre_name}` : 'Independent'}
                {doc.instructor_name ? `  ·  Instructor: ${doc.instructor_name}` : ''}
              </p>
            </div>
            <div className="mas-cert-serial">{doc.serial}</div>
          </div>
        )}
      </div>
    </section>
  );
}
