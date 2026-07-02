import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// A5 printable invoice / receipt. Routed:
//   /billing/invoice/:id   → invoice mode  (get_invoice_document)
//   /billing/receipt/:id   → receipt mode  (get_receipt_document)
// On screen: a centred A5 card + Print button. On print: just the A5 document
// (@page size A5). Payment instructions are a PLACEHOLDER until real bank
// details are provided.

type Mode = 'invoice' | 'receipt';
type Load = 'loading' | 'ready' | 'error' | 'empty';

const LEVEL_LABEL: Record<string, string> = {
  starfish: 'Starfish', sea_turtle: 'Sea Turtle', guppy: 'Guppy', octopus: 'Octopus',
  frog: 'Frog', swordfish: 'Swordfish', dolphin: 'Dolphin',
};

function money(n: unknown): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(s: string): string {
  if (s === 'pro_forma') return 'Estimate';
  if (s === 'issued') return 'Awaiting payment';
  if (s === 'paid') return 'Paid';
  if (s === 'void') return 'Void';
  return s;
}

const CSS = `
.mas-doc-screen { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:1.5rem 1rem; }
.mas-doc-toolbar { display:flex; gap:0.6rem; }
.mas-doc-print {
  font:inherit; font-weight:700; cursor:pointer; border:none; border-radius:8px;
  background:#1E2752; color:#fff; padding:0.55rem 1.2rem;
}
.mas-doc-back { font:inherit; cursor:pointer; border:1px solid #d7deea; border-radius:8px; background:#fff; color:#1E2752; padding:0.55rem 1rem; }
.mas-doc {
  background:#fff; color:#0a1f44; width:148mm; min-height:210mm; box-sizing:border-box;
  padding:14mm 14mm 12mm; box-shadow:0 2px 14px rgba(10,31,68,0.14);
  font-family:'Nunito Sans',Arial,sans-serif; font-size:11px; line-height:1.5;
}
.mas-doc-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1E2752; padding-bottom:8px; }
.mas-doc-brand { font-family:'Barlow Condensed',Arial,sans-serif; }
.mas-doc-brand .mas-doc-logo { font-weight:800; font-size:22px; letter-spacing:0.5px; color:#C62026; text-transform:uppercase; }
.mas-doc-brand .mas-doc-org { font-size:10px; color:#5d6b85; letter-spacing:2px; text-transform:uppercase; }
.mas-doc-kind { text-align:right; }
.mas-doc-kind h1 { font-family:'Barlow Condensed',Arial,sans-serif; font-size:26px; margin:0; color:#1E2752; text-transform:uppercase; letter-spacing:1px; }
.mas-doc-kind .mas-doc-no { font-weight:700; font-size:13px; }
.mas-doc-meta { display:flex; justify-content:space-between; margin-top:12px; gap:12px; }
.mas-doc-meta h3 { font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#5d6b85; margin:0 0 3px; }
.mas-doc-table { width:100%; border-collapse:collapse; margin-top:14px; }
.mas-doc-table th { text-align:left; background:#eef2f8; color:#1E2752; font-size:9px; text-transform:uppercase; letter-spacing:0.6px; padding:5px 7px; }
.mas-doc-table td { padding:5px 7px; border-bottom:1px solid #e3e9f3; }
.mas-doc-table .num { text-align:right; }
.mas-doc-total { display:flex; justify-content:flex-end; margin-top:10px; }
.mas-doc-total table td { padding:3px 7px; }
.mas-doc-total .grand { font-weight:800; font-size:13px; border-top:2px solid #1E2752; }
.mas-doc-pay { margin-top:16px; border:1px dashed #b9c4d8; border-radius:6px; padding:9px 11px; background:#f8fafd; }
.mas-doc-pay h3 { font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#5d6b85; margin:0 0 4px; }
.mas-doc-paytable td { padding:1px 0; vertical-align:top; }
.mas-doc-paytable .mas-doc-payk { color:#5d6b85; width:34%; padding-right:8px; }
.mas-doc-foot { margin-top:18px; font-size:9px; color:#5d6b85; text-align:center; border-top:1px solid #e3e9f3; padding-top:8px; }
.mas-doc-paidstamp { display:inline-block; border:2px solid #1a7f4b; color:#1a7f4b; font-weight:800; text-transform:uppercase; letter-spacing:1px; padding:3px 10px; border-radius:5px; transform:rotate(-4deg); }
@media print {
  @page { size: A5; margin: 0; }
  body * { visibility:hidden; }
  .mas-doc, .mas-doc * { visibility:visible; }
  .mas-doc { position:absolute; left:0; top:0; box-shadow:none; width:148mm; }
  .mas-doc-toolbar, .mas-doc-back, .mas-doc-print { display:none !important; }
}
`;

interface DocData {
  [k: string]: unknown;
  items?: Array<{ description: string | null; level: string | null; candidate_name: string | null; quantity: number; unit_amount: number; amount: number }>;
}

interface FinanceSettings {
  beneficiary_name: string | null;
  bank_name: string | null;
  bank_address: string | null;
  account_myr: string | null;
  account_usd: string | null;
  swift_code: string | null;
  finance_email: string | null;
  finance_pic: string | null;
  pay_note: string | null;
}

export default function PrintableDocument({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocData | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [finance, setFinance] = useState<FinanceSettings | null>(null);

  const fetchDoc = useCallback(async () => {
    if (!id) {
      setLoad('error');
      return;
    }
    setLoad('loading');
    const fn = mode === 'invoice' ? 'get_invoice_document' : 'get_receipt_document';
    const { data, error } = await supabase.rpc(fn, { _invoice_id: id });
    if (error) {
      setLoad('error');
      return;
    }
    if (!data) {
      setLoad('empty');
      return;
    }
    setDoc(data as DocData);
    setLoad('ready');
  }, [id, mode]);

  // Payment instructions are only needed on invoices.
  const fetchFinance = useCallback(async () => {
    if (mode !== 'invoice') return;
    const { data } = await supabase.rpc('get_finance_settings');
    const row = (Array.isArray(data) ? data[0] : data) as FinanceSettings | null;
    if (row) setFinance(row);
  }, [mode]);

  useEffect(() => {
    fetchDoc();
    fetchFinance();
  }, [fetchDoc, fetchFinance]);

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <div className="mas-doc-screen">
        <div className="mas-doc-toolbar">
          <button className="mas-doc-back" onClick={() => window.history.back()}>← Back</button>
          {load === 'ready' && (
            <button className="mas-doc-print" onClick={() => window.print()}>Print / Save as PDF</button>
          )}
        </div>

        {load === 'loading' && <p className="mas-status">Loading…</p>}
        {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load this document.</p>}
        {load === 'empty' && (
          <p className="mas-status">
            {mode === 'receipt' ? 'No receipt yet — this invoice isn’t fully paid.' : 'Invoice not found.'}
          </p>
        )}

        {load === 'ready' && doc && (mode === 'invoice' ? <Invoice d={doc} finance={finance} /> : <Receipt d={doc} />)}
      </div>
    </section>
  );
}

function DocHead({ kind, no }: { kind: string; no: string }) {
  return (
    <div className="mas-doc-head">
      <div className="mas-doc-brand">
        <div className="mas-doc-logo">MAS Badges</div>
        <div className="mas-doc-org">Malaysia Aquatics · Swim Badges</div>
      </div>
      <div className="mas-doc-kind">
        <h1>{kind}</h1>
        <div className="mas-doc-no">{no}</div>
      </div>
    </div>
  );
}

function Invoice({ d, finance }: { d: DocData; finance: FinanceSettings | null }) {
  const items = d.items ?? [];
  const status = String(d.status ?? '');
  const invoiceNo = String(d.invoice_no ?? '—');
  return (
    <div className="mas-doc">
      <DocHead kind="Invoice" no={invoiceNo} />
      <div className="mas-doc-meta">
        <div>
          <h3>Billed to</h3>
          <div><strong>{String(d.bill_to_name ?? '—')}</strong></div>
          {d.centre_name ? <div>{String(d.centre_name)}</div> : null}
          {d.bill_to_email ? <div>{String(d.bill_to_email)}</div> : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3>Details</h3>
          <div>Date: {prettyDate(String(d.created_at ?? ''))}</div>
          <div>Session: {String(d.venue ?? '—')}</div>
          <div>{prettyDate(d.scheduled_on as string)}</div>
          <div>Status: {statusLabel(status)}</div>
        </div>
      </div>

      <table className="mas-doc-table">
        <thead>
          <tr><th>Description</th><th>Candidate</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={3}>No line items.</td></tr>
          ) : (
            items.map((it, i) => (
              <tr key={i}>
                <td>{it.level ? LEVEL_LABEL[it.level] ?? it.level : it.description ?? '—'}</td>
                <td>{it.candidate_name ?? '—'}</td>
                <td className="num">{money(it.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mas-doc-total">
        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="num">{money(d.subtotal)}</td></tr>
            <tr className="grand"><td>Total</td><td className="num">{money(d.total)}</td></tr>
          </tbody>
        </table>
      </div>

      {status !== 'paid' && (
        <div className="mas-doc-pay">
          <h3>How to pay</h3>
          {finance ? (
            <>
              <div style={{ marginBottom: '5px' }}>
                Please make payment to <strong>{finance.beneficiary_name}</strong> and quote
                invoice <strong>{invoiceNo}</strong> as your reference.
              </div>
              <table className="mas-doc-paytable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td className="mas-doc-payk">Beneficiary</td><td>{finance.beneficiary_name}</td></tr>
                  <tr><td className="mas-doc-payk">Bank</td><td>{finance.bank_name}</td></tr>
                  {finance.account_myr && <tr><td className="mas-doc-payk">Account (MYR)</td><td>{finance.account_myr}</td></tr>}
                  {finance.swift_code && <tr><td className="mas-doc-payk">SWIFT</td><td>{finance.swift_code}</td></tr>}
                  <tr><td className="mas-doc-payk">Reference</td><td><strong>{invoiceNo}</strong></td></tr>
                </tbody>
              </table>
              {finance.pay_note && (
                <div style={{ marginTop: '5px' }}>{finance.pay_note}</div>
              )}
              {finance.finance_email && (
                <div style={{ marginTop: '4px' }}>
                  Send proof of payment to <strong>{finance.finance_email}</strong>
                  {finance.finance_pic ? ` (attn: ${finance.finance_pic})` : ''}.
                </div>
              )}
            </>
          ) : (
            <div>Payment details will be provided by the MAS office.</div>
          )}
        </div>
      )}

      <div className="mas-doc-foot">
        MAS Badges · Malaysia Aquatics Learn-to-Swim certification · This is a computer-generated invoice.
      </div>
    </div>
  );
}

function Receipt({ d }: { d: DocData }) {
  return (
    <div className="mas-doc">
      <DocHead kind="Receipt" no={String(d.receipt_no ?? '—')} />
      <div className="mas-doc-meta">
        <div>
          <h3>Received from</h3>
          <div><strong>{String(d.bill_to_name ?? '—')}</strong></div>
          {d.centre_name ? <div>{String(d.centre_name)}</div> : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3>Details</h3>
          <div>Date paid: {prettyDate(d.paid_at as string)}</div>
          <div>For invoice: {String(d.invoice_no ?? '—')}</div>
          <div>Session: {String(d.venue ?? '—')}</div>
        </div>
      </div>

      <table className="mas-doc-table">
        <thead>
          <tr><th>Description</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Assessment fees — invoice {String(d.invoice_no ?? '')}</td>
            <td className="num">{money(d.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mas-doc-total">
        <table>
          <tbody>
            <tr className="grand"><td>Amount paid</td><td className="num">{money(d.amount)}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '14px' }}>
        <span className="mas-doc-paidstamp">Paid</span>
        {d.method ? <span style={{ marginLeft: '10px', color: '#5d6b85' }}>Method: {String(d.method)}</span> : null}
        {d.reference ? <span style={{ marginLeft: '10px', color: '#5d6b85' }}>Ref: {String(d.reference)}</span> : null}
      </div>

      <div className="mas-doc-foot">
        MAS Badges · Malaysia Aquatics Learn-to-Swim certification · Thank you. This is a computer-generated receipt.
      </div>
    </div>
  );
}
