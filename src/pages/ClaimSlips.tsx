// #16 — Claim slips, dense-table conversion + jsPDF tear-out cards.
// Reads (unchanged wire): candidates via RLS (instructor scope: theirs; governance: all).
// House law: dense table · Unclaimed/Claimed tabs · per-row Print · batch Print button.
// PDF: A4 portrait, 6 cards per page (3×2), dashed cut guides. Same jsPDF pattern
// as PrintableCertificate — one shared coordinate model, actual downloadable file.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Candidate {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  claim_code: string | null;
  claimed_by_profile_id: string | null;
  partner_center_id: string | null;
  swimmer_id: string | null;
  created_at: string;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'unclaimed' | 'claimed';

const PORTAL = 'apps.masbadges.org';

function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

// ---------- PDF generation ----------
// A4 portrait: 210 × 297 mm. Grid: 3 rows × 2 cols. Card = ~85 × 85 mm with 15mm margins.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 15;
const MARGIN_Y = 20;
const GAP = 4;
const COLS = 2;
const ROWS = 3;
const CARD_W = (PAGE_W - MARGIN_X * 2 - GAP * (COLS - 1)) / COLS; // ≈ 88 mm
const CARD_H = (PAGE_H - MARGIN_Y * 2 - GAP * (ROWS - 1)) / ROWS; // ≈ 82 mm

function drawCard(pdf: jsPDF, c: Candidate, x: number, y: number) {
  // Dashed cut guide.
  pdf.setDrawColor(180);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  pdf.rect(x, y, CARD_W, CARD_H);
  pdf.setLineDashPattern([], 0);

  // Header ribbon.
  pdf.setFillColor(30, 39, 82); // navy
  pdf.rect(x, y, CARD_W, 10, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('MAS BADGES · CLAIM SLIP', x + CARD_W / 2, y + 6.5, { align: 'center' });

  // Body.
  const bodyX = x + 6;
  let cy = y + 16;
  pdf.setTextColor(30, 39, 82);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text("Child's name", bodyX, cy);
  cy += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  // Auto-shrink long names.
  let nameSize = 13;
  while (nameSize > 8 && pdf.getTextWidth(c.full_name) > CARD_W - 12) {
    nameSize -= 1;
    pdf.setFontSize(nameSize);
  }
  pdf.text(c.full_name, bodyX, cy);
  cy += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(
    `${prettyDate(c.date_of_birth)}${c.swimmer_id ? '  ·  ' + c.swimmer_id : ''}`,
    bodyX, cy,
  );
  cy += 8;

  // Claim code — the star of the card.
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 120);
  pdf.text('YOUR CLAIM CODE', bodyX, cy);
  cy += 5;
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(198, 32, 38); // red
  pdf.text(c.claim_code ?? '—', bodyX, cy);
  cy += 8;

  // Instructions.
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(30, 39, 82);
  const instructions = [
    `1.  Go to ${PORTAL} and create an account (or sign in).`,
    `2.  Open "My child's badges".`,
    `3.  Enter the code above to link your child.`,
  ];
  for (const line of instructions) {
    pdf.text(line, bodyX, cy);
    cy += 4;
  }

  // Footer.
  pdf.setFontSize(6.5);
  pdf.setTextColor(140, 148, 165);
  pdf.text('Keep this code private — it links to your account.', bodyX, y + CARD_H - 4);
}

async function generateSlipsPdf(cands: Candidate[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  cands.forEach((c, i) => {
    const idx = i % (COLS * ROWS);
    if (i > 0 && idx === 0) pdf.addPage();
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = MARGIN_X + col * (CARD_W + GAP);
    const y = MARGIN_Y + row * (CARD_H + GAP);
    drawCard(pdf, c, x, y);
  });
  return pdf.output('blob');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Screen ----------
export default function ClaimSlips() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('unclaimed');
  const [query, setQuery] = useState('');
  const [busyBatch, setBusyBatch] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('candidates')
      .select('id, full_name, date_of_birth, claim_code, claimed_by_profile_id, partner_center_id, swimmer_id, created_at')
      .eq('status', 'active')
      .order('full_name');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as Candidate[]);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const counts = useMemo(() => ({
    unclaimed: rows.filter((c) => !c.claimed_by_profile_id && c.claim_code).length,
    claimed: rows.filter((c) => !!c.claimed_by_profile_id).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((c) =>
        tab === 'unclaimed'
          ? (!c.claimed_by_profile_id && c.claim_code)
          : !!c.claimed_by_profile_id,
      )
      .filter((c) =>
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        (c.claim_code ?? '').toLowerCase().includes(q) ||
        (c.swimmer_id ?? '').toLowerCase().includes(q));
  }, [rows, tab, query]);

  async function batchPrint() {
    if (filtered.length === 0) return;
    setBusyBatch(true); setErr(null);
    try {
      const blob = await generateSlipsPdf(filtered);
      downloadBlob(blob, `MAS-Claim-Slips-${filtered.length}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setBusyBatch(false);
    }
  }

  async function printOne(c: Candidate) {
    setBusyRow(c.id); setErr(null);
    try {
      const blob = await generateSlipsPdf([c]);
      const first = (c.full_name || 'slip').split(/\s+/)[0].replace(/[^A-Za-z0-9-]/g, '');
      downloadBlob(blob, `MAS-Claim-Slip-${first}-${c.claim_code}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Candidates</p>
        <h1>Parent claim slips</h1>
        <p className="mas-lede">
          Hand each family their slip so they can claim their child’s record and view badges
          online. Download all unclaimed slips as one PDF (6 per A4 page, cut along the dashed
          guides), or generate a single slip for a specific candidate.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchCandidates} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'unclaimed'}
            className={tab === 'unclaimed' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('unclaimed')}>Unclaimed ({counts.unclaimed})</button>
          <button role="tab" aria-selected={tab === 'claimed'}
            className={tab === 'claimed' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('claimed')}>Claimed ({counts.claimed})</button>
        </div>
        <input
          className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, claim code, swimmer ID"
          style={{ maxWidth: '22rem' }}
        />
        {tab === 'unclaimed' && (
          <button
            className="mas-btn-primary"
            onClick={batchPrint}
            disabled={busyBatch || filtered.length === 0}
          >
            {busyBatch ? 'Generating…' : `Download PDF (${filtered.length} slip${filtered.length === 1 ? '' : 's'})`}
          </button>
        )}
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {err && <p className="mas-status mas-status-bad">Couldn’t generate PDF: {err}</p>}
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load candidates. Refresh to try again.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">
          {tab === 'unclaimed' ? 'No unclaimed slips.' : 'No claimed candidates.'}
        </p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Born</th>
                <th>Swimmer ID</th>
                <th>Claim code</th>
                <th>Registered</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const age = ageFrom(c.date_of_birth);
                const canPrint = !!c.claim_code;
                return (
                  <tr key={c.id}>
                    <td className="mas-cell-strong">{c.full_name}</td>
                    <td>
                      <span className="mas-cell-stack">
                        <span>{prettyDate(c.date_of_birth)}</span>
                        {age !== null && <span className="mas-cell-sub">{age} yrs</span>}
                      </span>
                    </td>
                    <td className="mas-cell-strong">{c.swimmer_id ?? '—'}</td>
                    <td>{c.claim_code ? <span className="mas-serial">{c.claim_code}</span> : '—'}</td>
                    <td>{prettyDate(c.created_at?.slice(0, 10) ?? null)}</td>
                    <td className="mas-table-actioncol">
                      {tab === 'unclaimed' && canPrint && (
                        <button
                          className="mas-btn-ghost mas-btn-compact"
                          onClick={() => printOne(c)}
                          disabled={busyRow === c.id}
                        >
                          {busyRow === c.id ? '…' : 'Print slip'}
                        </button>
                      )}
                      {tab === 'claimed' && <span className="mas-outcome is-pass">Claimed</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
