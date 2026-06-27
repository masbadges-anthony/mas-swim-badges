import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Candidate {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  claim_code: string | null;
  claimed_by_profile_id: string | null;
}

type Load = 'loading' | 'ready' | 'error';

const PORTAL = 'apps.masbadges.org';

function prettyDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClaimSlips() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const fetchCandidates = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('candidates')
      .select('id, full_name, date_of_birth, claim_code, claimed_by_profile_id')
      .eq('status', 'active')
      .order('full_name');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as Candidate[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Viewing the slips list clears its sidebar attention dot.
  useEffect(() => { void supabase.rpc('mark_attention_seen', { _topic: 'claim_slips' }); }, []);

  const unclaimed = rows.filter((c) => !c.claimed_by_profile_id && c.claim_code);

  return (
    <>
      <section className="mas-page mas-noprint">
        <header className="mas-page-head">
          <p className="mas-eyebrow">Candidates</p>
          <h1>Parent claim slips</h1>
          <p className="mas-lede">
            Hand each family their slip so they can claim their child’s record and
            view badges online. Slips are printed only for candidates not yet
            claimed by a parent.
          </p>
        </header>

        <div className="mas-admin-toolbar">
          <button className="mas-btn-ghost" onClick={fetchCandidates} disabled={load === 'loading'}>
            Refresh
          </button>
          <button
            className="mas-btn-primary"
            onClick={() => window.print()}
            disabled={unclaimed.length === 0}
          >
            Print {unclaimed.length} slip{unclaimed.length === 1 ? '' : 's'}
          </button>
        </div>

        {load === 'loading' && <p className="mas-status">Loading…</p>}
        {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load candidates.</p>}
        {load === 'ready' && rows.length === 0 && (
          <p className="mas-status">No candidates yet.</p>
        )}

        {load === 'ready' && rows.length > 0 && (
          <ul className="mas-admin-list">
            {rows.map((c) => {
              const claimed = !!c.claimed_by_profile_id;
              return (
                <li key={c.id} className="mas-admin-row">
                  <div className="mas-admin-main">
                    <h2 className="mas-admin-name">{c.full_name}</h2>
                    <p className="mas-admin-meta">
                      <span className={`mas-outcome ${claimed ? 'is-pass' : 'is-refer'}`}>
                        {claimed ? 'Claimed' : 'Unclaimed'}
                      </span>
                      <span className="mas-admin-sub">
                        {c.date_of_birth ? prettyDate(c.date_of_birth) : ''}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Printable slips — one per unclaimed family. The print stylesheet hides
          everything else. */}
      <div className="mas-slips">
        {unclaimed.map((c) => (
          <div key={c.id} className="mas-slip">
            <h3>Claim your child’s MAS Swim Badges record</h3>
            <p>
              <strong>{c.full_name}</strong>
              {c.date_of_birth ? ` · ${prettyDate(c.date_of_birth)}` : ''}
            </p>
            <p className="mas-slip-label">Your claim code</p>
            <p className="mas-slip-code">{c.claim_code}</p>
            <ol>
              <li>Go to {PORTAL} and create an account (or sign in).</li>
              <li>Open “My child’s badges”.</li>
              <li>Enter the claim code above to link your child and see their badges.</li>
            </ol>
            <p className="mas-slip-foot">Keep this code private — it links your child’s record to your account.</p>
          </div>
        ))}
      </div>
    </>
  );
}
