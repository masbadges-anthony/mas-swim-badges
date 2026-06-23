import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/public.css';

// Display names + placeholder accent colours per badge level.
// Swap the colours for the official badge artwork colours when ready.
const LEVELS: Record<string, { label: string; color: string }> = {
  starfish:   { label: 'Starfish',   color: '#E8662B' },
  sea_turtle: { label: 'Sea Turtle', color: '#1FA36B' },
  guppy:      { label: 'Guppy',      color: '#1F9ED1' },
  octopus:    { label: 'Octopus',    color: '#8E44AD' },
  frog:       { label: 'Frog',       color: '#6AA84F' },
  swordfish:  { label: 'Swordfish',  color: '#C62026' },
  dolphin:    { label: 'Dolphin',    color: '#0a1f44' },
};

interface VerifyRow {
  serial: string;
  level: string;
  centre_name: string | null;
  issued_on: string;
  revoked: boolean;
}

type Status = 'idle' | 'searching' | 'found' | 'revoked' | 'notfound' | 'error';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Verify() {
  const params = useParams();
  const [serial, setSerial] = useState(params.serial ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<VerifyRow | null>(null);

  async function check(value: string) {
    const s = value.trim();
    if (!s) return;
    setStatus('searching');
    setResult(null);
    const { data, error } = await supabase.rpc('verify_certificate', { _serial: s });
    if (error) {
      setStatus('error');
      return;
    }
    const row = ((data ?? []) as VerifyRow[])[0];
    if (!row) {
      setStatus('notfound');
      return;
    }
    setResult(row);
    setStatus(row.revoked ? 'revoked' : 'found');
  }

  // Deep-link / QR support: /verify/:serial auto-checks on load.
  useEffect(() => {
    if (params.serial) check(params.serial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.serial]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    check(serial);
  }

  const level = result ? LEVELS[result.level] : undefined;

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Verify</p>
        <h1>Verify a certificate</h1>
        <p className="mas-lede">
          Enter the serial printed on a Swim Badges certificate to confirm it is
          genuine. For the privacy of our young swimmers, no personal details are
          shown — only that the certificate is authentic.
        </p>
      </header>

      <form className="mas-verify-form" onSubmit={onSubmit}
            style={{ display: 'flex', gap: '0.6rem', maxWidth: '460px', flexWrap: 'wrap' }}>
        <input
          className="mas-input"
          type="text"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="e.g. MAS-2026-XXXXXXXX"
          aria-label="Certificate serial"
          style={{ flex: 1, minWidth: '220px' }}
        />
        <button className="mas-btn" type="submit" disabled={status === 'searching'}>
          {status === 'searching' ? 'Checking…' : 'Verify'}
        </button>
      </form>

      {status === 'notfound' && (
        <div className="mas-result" style={{ marginTop: '1.5rem' }}>
          <p className="mas-pill-bad">No certificate found</p>
          <p className="mas-lede">
            We couldn’t find a certificate with that serial. Check the serial and
            try again — it should look like <span className="mas-mono">MAS-2026-XXXXXXXX</span>.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mas-result" style={{ marginTop: '1.5rem' }}>
          <p className="mas-pill-bad">Couldn’t check right now</p>
          <p className="mas-lede">Something went wrong verifying that serial. Please try again in a moment.</p>
        </div>
      )}

      {(status === 'found' || status === 'revoked') && result && (
        <div className="mas-result" style={{ marginTop: '1.5rem' }}>
          <div className="mas-result-band" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span
              aria-hidden
              style={{
                width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
                background: level?.color ?? '#94a3b8',
              }}
            />
            <span className={status === 'revoked' ? 'mas-pill-bad' : 'mas-pill-good'}>
              {status === 'revoked' ? 'Revoked' : 'Valid certificate'}
            </span>
          </div>

          <div
            className="mas-result-grid"
            style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', rowGap: '0.55rem', columnGap: '1.25rem' }}
          >
            <span className="mas-muted">Badge level</span>
            <strong>{level?.label ?? result.level}</strong>

            <span className="mas-muted">Issuing centre</span>
            <strong>{result.centre_name ?? '—'}</strong>

            <span className="mas-muted">Issued on</span>
            <strong>{fmtDate(result.issued_on)}</strong>

            <span className="mas-muted">Serial</span>
            <strong className="mas-mono">{result.serial}</strong>
          </div>

          {status === 'revoked' && (
            <p className="mas-lede" style={{ marginTop: '1rem' }}>
              This serial belonged to a certificate that has since been revoked and
              is no longer valid. If it was reissued, the swimmer will hold a new
              certificate with a different serial.
            </p>
          )}

          <p className="mas-lede" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            For privacy, the swimmer’s name is not shown. The person holding the
            certificate can match it by the serial above.
          </p>
        </div>
      )}
    </section>
  );
}
