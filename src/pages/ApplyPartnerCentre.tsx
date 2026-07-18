// Public "Become a partner centre" enquiry form.
// Lightweight intake: name, email, phone, centre name, state, message.
// Submits to submit_public_enquiry() as category='centre_partnership'.
// Anonymous — no signup required.
import { useState } from 'react';
import { supabase } from '../lib/supabase';

const STATES = [
  'johor', 'kedah', 'kelantan', 'melaka', 'negeri_sembilan', 'pahang',
  'perak', 'perlis', 'pulau_pinang', 'sabah', 'sarawak', 'selangor',
  'terengganu', 'kuala_lumpur', 'labuan', 'putrajaya',
];

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

const CSS = `
.mas-apply {
  max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem 5rem;
  font-family: var(--mas-font, system-ui, sans-serif);
  color: var(--mas-navy, #1E2752);
}
.mas-apply-head { text-align: center; margin-bottom: 2rem; }
.mas-apply-head p.eyebrow {
  color: var(--mas-red, #C62026); font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 0.4rem;
  font-weight: 700;
}
.mas-apply-head h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin: 0 0 0.6rem; font-weight: 800; }
.mas-apply-head p.lede { color: var(--mas-muted, #5b6472); font-size: 1rem; line-height: 1.55; }
.mas-apply-card {
  background: #fff; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 12px;
  padding: 2rem;
}
.mas-apply-card h2 { font-size: 1.1rem; margin: 0 0 0.4rem; }
.mas-apply-card p.help { color: var(--mas-muted, #5b6472); font-size: 0.9rem; margin: 0 0 1.4rem; line-height: 1.5; }
.mas-apply-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 0.8rem; }
@media (max-width: 500px) { .mas-apply-row { grid-template-columns: 1fr; } }
.mas-apply-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
.mas-apply-field label { font-size: 0.82rem; color: var(--mas-muted, #5b6472); font-weight: 600; }
.mas-apply-field input, .mas-apply-field select, .mas-apply-field textarea {
  font: inherit; padding: 0.65rem 0.8rem; border: 1px solid var(--mas-line, #e3e9f3);
  border-radius: 6px; background: #fff; color: var(--mas-navy, #1E2752);
}
.mas-apply-field textarea { resize: vertical; min-height: 6rem; }
.mas-apply-field .req { color: var(--mas-red, #C62026); margin-left: 0.15rem; }
.mas-apply-submit {
  width: 100%; padding: 0.9rem; background: var(--mas-navy, #1E2752); color: #fff;
  border: 0; border-radius: 8px; font: inherit; font-weight: 700; font-size: 1rem;
  cursor: pointer; margin-top: 0.6rem;
}
.mas-apply-submit:disabled { background: var(--mas-muted, #5b6472); cursor: not-allowed; }
.mas-apply-msg {
  padding: 1rem 1.2rem; border-radius: 8px; margin-bottom: 1.2rem; font-size: 0.92rem;
}
.mas-apply-msg.is-error { background: #f7e3e4; color: var(--mas-red, #C62026); }
.mas-apply-msg.is-ok { background: #dff3e6; color: #0d5928; }
.mas-apply-done {
  text-align: center; padding: 3rem 1.5rem; background: #dff3e6; border-radius: 12px;
}
.mas-apply-done h2 { color: #0d5928; margin: 0 0 0.5rem; }
.mas-apply-done p { color: #0d5928; margin: 0; }
`;

export default function ApplyPartnerCentre() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [state, setState] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    if (!name.trim() || !email.trim() || !orgName.trim() || !state || !message.trim()) {
      setErr('Please complete all required fields.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('submit_public_enquiry', {
      _category: 'centre_partnership',
      _contact_name: name.trim(),
      _contact_email: email.trim(),
      _contact_phone: phone.trim() || null,
      _organisation: orgName.trim(),
      _state: state,
      _message: message.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mas-apply">
        <style>{CSS}</style>
        <header className="mas-apply-head">
          <p className="eyebrow">Application received</p>
          <h1>Thank you</h1>
        </header>
        <div className="mas-apply-done">
          <h2>We&rsquo;ll be in touch</h2>
          <p>
            Your enquiry has reached the MAS BADGES team. We&rsquo;ll review it and
            respond by email within a few working days with the next steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mas-apply">
      <style>{CSS}</style>
      <header className="mas-apply-head">
        <p className="eyebrow">For Centres</p>
        <h1>Become a partner centre</h1>
        <p className="lede">
          Interested in teaching the MAS BADGES syllabus at your swim school, or offering
          your pool as a venue for MAS BADGES assessments? Tell us about your centre and
          we&rsquo;ll get in touch to walk you through the recognition process.
        </p>
      </header>

      <div className="mas-apply-card">
        <h2>Enquiry form</h2>
        <p className="help">
          This is a preliminary enquiry. Once we&rsquo;ve reviewed your interest, we&rsquo;ll
          send you a personal link to submit the full application including photos, address
          details, and pool specifications.
        </p>

        {err && <div className="mas-apply-msg is-error">{err}</div>}

        <div className="mas-apply-row">
          <div className="mas-apply-field">
            <label>Your name<span className="req">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="mas-apply-field">
            <label>Email<span className="req">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        <div className="mas-apply-row">
          <div className="mas-apply-field">
            <label>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          <div className="mas-apply-field">
            <label>Centre / Swim school name<span className="req">*</span></label>
            <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
        </div>

        <div className="mas-apply-field">
          <label>State<span className="req">*</span></label>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Select state…</option>
            {STATES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </select>
        </div>

        <div className="mas-apply-field">
          <label>Tell us about your centre<span className="req">*</span></label>
          <textarea rows={5} value={message} maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="A brief introduction: how long you've been operating, roughly how many students, whether you're interested in teaching, assessment, or both, and anything else that helps us understand your centre." />
        </div>

        <button className="mas-apply-submit" onClick={submit} disabled={busy}>
          {busy ? 'Sending…' : 'Send enquiry'}
        </button>
      </div>
    </div>
  );
}
