import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Fee { code: string; label: string; default_amount: number; }
interface Row {
  centre_id: string; centre_name: string; state: string; poc_email: string;
  approved_at: string; invoice_id: string | null; invoice_status: string | null;
  total_amount: number | null; paid_amount: number | null; period_end: string | null;
  centre_status: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const inAYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

export default function CentreBilling() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // per-centre invoice draft + per-invoice payment draft
  const [draft, setDraft] = useState<Record<string, { picked: Record<string, number>; start: string; end: string; note: string }>>({});
  const [pay, setPay] = useState<Record<string, { method: string; amount: string; reference: string; proof: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [r, f] = await Promise.all([
      supabase.rpc('list_centre_billing'),
      supabase.rpc('list_centre_fee_catalog'),
    ]);
    setRows((r.data ?? []) as Row[]);
    setFees((f.data ?? []) as Fee[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function draftFor(id: string) {
    return draft[id] ?? { picked: {}, start: today(), end: inAYear(), note: '' };
  }
  function togglePick(id: string, fee: Fee) {
    const d = draftFor(id); const picked = { ...d.picked };
    if (fee.code in picked) delete picked[fee.code]; else picked[fee.code] = fee.default_amount;
    setDraft((p) => ({ ...p, [id]: { ...d, picked } }));
  }
  function setAmount(id: string, code: string, v: number) {
    const d = draftFor(id);
    setDraft((p) => ({ ...p, [id]: { ...d, picked: { ...d.picked, [code]: v } } }));
  }

  async function inviteAdmin(centreId: string, email: string) {
    setBusy(centreId);
    await supabase.rpc('invite_centre_admin', { _centre: centreId, _email: email });
    setBusy(null);
    alert('Invitation recorded. The point-of-communication can now register to administer the centre.');
  }

  async function createInvoice(centreId: string) {
    const d = draftFor(centreId);
    const items = Object.entries(d.picked).map(([code, amount]) => ({
      label: fees.find((f) => f.code === code)?.label ?? code, amount,
    }));
    if (items.length === 0) { alert('Pick at least one fee item.'); return; }
    setBusy(centreId);
    const { error } = await supabase.rpc('create_centre_invoice', {
      _centre: centreId, _period_start: d.start, _period_end: d.end, _items: items, _note: d.note || null,
    });
    setBusy(null);
    if (error) { alert(error.message); return; }
    load();
  }

  async function recordPayment(invoiceId: string) {
    const p = pay[invoiceId] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
    if (!p.amount) { alert('Enter the amount paid.'); return; }
    setBusy(invoiceId);
    await supabase.rpc('record_centre_payment', {
      _invoice: invoiceId, _method: p.method, _amount: Number(p.amount),
      _reference: p.reference || null, _proof_url: p.proof || null,
    });
    setBusy(null);
    load();
  }

  async function markPaid(invoiceId: string) {
    setBusy(invoiceId);
    const { error } = await supabase.rpc('mark_centre_invoice_paid', { _invoice: invoiceId });
    setBusy(null);
    if (error) { alert(error.message); return; }
    load();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Accounts</p>
        <h1>Centre billing</h1>
        <p className="mas-lede">
          Approved centres awaiting billing. Invite the centre administrator, raise
          the invoice from the fee structure, record the verified payment with proof,
          then mark it paid — which recognises and lists the centre.
        </p>
      </header>

      {loading && <p className="mas-status">Loading…</p>}
      {!loading && rows.length === 0 && <p className="mas-status">No approved centres awaiting billing.</p>}

      {!loading && rows.map((r) => {
        const recognised = r.centre_status === 'recognized';
        const hasInvoice = !!r.invoice_id;
        const outstanding = r.invoice_status === 'outstanding';
        const d = draftFor(r.centre_id);
        const p = pay[r.invoice_id ?? ''] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
        return (
          <div key={r.centre_id} className="mas-form" style={{ marginBottom: '0.9rem' }}>
            <div className="mas-form-cardhead">
              <div>
                {recognised ? <span className="mas-badge is-success">Recognised &amp; listed</span>
                  : outstanding ? <span className="mas-badge is-warning">Outstanding</span>
                  : <span className="mas-badge is-danger">New · needs invoicing</span>}
                <h2 style={{ marginTop: '0.5rem' }}>{r.centre_name}</h2>
              </div>
              <span className="mas-field-opt">{r.state}</span>
            </div>

            <div className="mas-form-actions" style={{ marginBottom: '1rem' }}>
              <button className="mas-btn-ghost" disabled={busy === r.centre_id} onClick={() => inviteAdmin(r.centre_id, r.poc_email)}>
                Invite centre admin ({r.poc_email})
              </button>
            </div>

            {!hasInvoice && !recognised && (
              <>
                <p className="mas-field-label">Raise invoice</p>
                {fees.map((f) => {
                  const on = f.code in d.picked;
                  return (
                    <div key={f.code} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <label className="mas-switch">
                        <input type="checkbox" checked={on} onChange={() => togglePick(r.centre_id, f)} />
                        <span className="mas-switch-slider" />
                        <span className="mas-switch-text">{f.label}</span>
                      </label>
                      {on && (
                        <input className="mas-input" type="number" style={{ width: '120px' }}
                          value={d.picked[f.code]} onChange={(e) => setAmount(r.centre_id, f.code, Number(e.target.value))} />
                      )}
                    </div>
                  );
                })}
                <div className="mas-form-grid" style={{ marginTop: '0.75rem' }}>
                  <div className="mas-field">
                    <label className="mas-field-label">Listing from</label>
                    <input className="mas-input" type="date" value={d.start}
                      onChange={(e) => setDraft((pp) => ({ ...pp, [r.centre_id]: { ...d, start: e.target.value } }))} />
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Listing until</label>
                    <input className="mas-input" type="date" value={d.end}
                      onChange={(e) => setDraft((pp) => ({ ...pp, [r.centre_id]: { ...d, end: e.target.value } }))} />
                  </div>
                </div>
                <div className="mas-form-actions" style={{ marginTop: '0.75rem' }}>
                  <button className="mas-btn-primary" disabled={busy === r.centre_id} onClick={() => createInvoice(r.centre_id)}>
                    {busy === r.centre_id ? 'Creating…' : 'Create invoice'}
                  </button>
                </div>
              </>
            )}

            {hasInvoice && outstanding && r.invoice_id && (
              <>
                <p className="mas-field-note">
                  Invoice total RM {Number(r.total_amount).toFixed(2)} · recorded RM {Number(r.paid_amount ?? 0).toFixed(2)}
                </p>
                <div className="mas-form-grid" style={{ marginTop: '0.5rem' }}>
                  <div className="mas-field">
                    <label className="mas-field-label">Payment method</label>
                    <select className="mas-select" value={p.method}
                      onChange={(e) => setPay((pp) => ({ ...pp, [r.invoice_id!]: { ...p, method: e.target.value } }))}>
                      <option value="transfer">Bank transfer</option>
                      <option value="qr">QR pay</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Amount (RM)</label>
                    <input className="mas-input" type="number" value={p.amount}
                      onChange={(e) => setPay((pp) => ({ ...pp, [r.invoice_id!]: { ...p, amount: e.target.value } }))} />
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Reference <span className="mas-field-opt">(optional)</span></label>
                    <input className="mas-input" value={p.reference}
                      onChange={(e) => setPay((pp) => ({ ...pp, [r.invoice_id!]: { ...p, reference: e.target.value } }))} />
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Proof URL <span className="mas-field-opt">(optional)</span></label>
                    <input className="mas-input" value={p.proof} placeholder="Link to receipt / screenshot"
                      onChange={(e) => setPay((pp) => ({ ...pp, [r.invoice_id!]: { ...p, proof: e.target.value } }))} />
                  </div>
                </div>
                <div className="mas-form-actions" style={{ marginTop: '0.75rem', gap: '0.6rem' }}>
                  <button className="mas-btn-ghost" disabled={busy === r.invoice_id} onClick={() => recordPayment(r.invoice_id!)}>Record payment</button>
                  <button className="mas-btn-success" disabled={busy === r.invoice_id} onClick={() => markPaid(r.invoice_id!)}>Mark fully paid &amp; recognise</button>
                </div>
              </>
            )}

            {recognised && (
              <p className="mas-status mas-status-good">
                Recognised and listed{r.period_end ? ` · valid until ${r.period_end}` : ''}.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
