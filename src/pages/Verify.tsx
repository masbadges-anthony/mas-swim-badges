import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { levelMeta } from '../lib/levels';
import type { CertificateVerification } from '../lib/types';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; cert: CertificateVerification }
  | { kind: 'notfound' }
  | { kind: 'error' };

function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? d
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Verify() {
  const params = useParams<{ serial?: string }>();
  const navigate = useNavigate();
  const [serial, setSerial] = useState(params.serial ?? '');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function verify(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState({ kind: 'loading' });

    const { data, error } = await supabase.rpc('verify_certificate', { _serial: trimmed });

    if (error) {
      setState({ kind: 'error' });
      return;
    }
    const row = (data as CertificateVerification[] | null)?.[0];
    setState(row ? { kind: 'found', cert: row } : { kind: 'notfound' });
  }

  // Auto-verify when arriving via /verify/:serial (e.g. a certificate QR code).
  useEffect(() => {
    if (params.serial) verify(params.serial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.serial]);

  function onSubmit() {
    // Reflect the serial in the URL so the result is shareable.
    navigate(`/verify/${encodeURIComponent(serial.trim())}`);
    verify(serial);
  }

  return (
    <section className="mas-page mas-page-narrow">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Certificate check</p>
        <h1>Verify a certificate</h1>
        <p className="mas-lede">
          Enter the serial printed on a Swim Badges certificate to confirm it’s genuine.
        </p>
      </header>

      <div className="mas-verify-form">
        <input
          className="mas-input"
          placeholder="e.g. MAS-2026-A1B2C3D4E5F6"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          aria-label="Certificate serial"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="mas-btn" onClick={onSubmit} disabled={!serial.trim()}>
          Verify
        </button>
      </div>

      {state.kind === 'loading' && <p className="mas-status">Checking…</p>}

      {state.kind === 'error' && (
        <p className="mas-status mas-status-bad">
          Something went wrong. Check the serial and try again.
        </p>
      )}

      {state.kind === 'notfound' && (
        <p className="mas-status mas-status-bad">
          No certificate matches that serial.
        </p>
      )}

      {state.kind === 'found' && <Result cert={state.cert} onOpen={(s) => {
        setSerial(s);
        navigate(`/verify/${encodeURIComponent(s)}`);
        verify(s);
      }} />}
    </section>
  );
}

function Result({ cert, onOpen }: { cert: CertificateVerification; onOpen: (serial: string) => void }) {
  const meta = levelMeta(cert.level);

  return (
    <article className="mas-result" style={{ ['--accent' as string]: meta.accent }}>
      <div className="mas-result-band">
        <span className="mas-result-level">Level {meta.order} · {meta.label}</span>
        <span className={`mas-pill ${cert.is_valid ? 'mas-pill-good' : 'mas-pill-bad'}`}>
          {cert.is_valid ? 'Valid' : 'Revoked'}
        </span>
      </div>

      <dl className="mas-result-grid">
        <div><dt>Awarded to</dt><dd>{cert.candidate_name}</dd></div>
        <div><dt>Serial</dt><dd className="mas-mono">{cert.serial}</dd></div>
        <div><dt>Issued</dt><dd>{formatDate(cert.issued_on)}</dd></div>
        {cert.center_name && <div><dt>Centre</dt><dd>{cert.center_name}</dd></div>}
        {!cert.is_valid && cert.revoked_on && (
          <div><dt>Revoked</dt><dd>{formatDate(cert.revoked_on)}</dd></div>
        )}
      </dl>

      {!cert.is_valid && cert.replaced_by_serial && (
        <p className="mas-result-note">
          Replaced by{' '}
          <button className="mas-link" onClick={() => onOpen(cert.replaced_by_serial!)}>
            {cert.replaced_by_serial}
          </button>
        </p>
      )}
    </article>
  );
}
