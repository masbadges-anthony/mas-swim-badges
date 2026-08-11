import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import EditableText from './EditableText';
import '../styles/admin.css';

type Category = 'centre_partnership' | 'instructor_registration' | 'parent_swimmer' | 'general';

const TABS: { key: Category; label: string }[] = [
  { key: 'centre_partnership', label: 'Centre partnership' },
  { key: 'instructor_registration', label: 'Certified instructor' },
  { key: 'parent_swimmer', label: 'Parent / swimmer' },
  { key: 'general', label: 'General' },
];

const INTRO: Record<Category, string> = {
  centre_partnership:
    'Interested in becoming a recognised partner centre? Head to our dedicated application page — it captures everything we need to review your centre in one go.',
  instructor_registration:
    'Already a MAS Badges–certified instructor? Send your details and instructor ID. Our Instructor Trainer will verify and invite you to register for the portal.',
  parent_swimmer:
    'Questions about your child’s badges, claiming a certificate, or finding a centre? Send us a message.',
  general: 'Any other enquiry — we’ll route it to the right person.',
};

const STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak',
  'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya',
];

function topicToCategory(topic: string | null): Category {
  switch (topic) {
    case 'centre': return 'centre_partnership';
    case 'instructor': return 'instructor_registration';
    case 'parent': return 'parent_swimmer';
    default: return 'general';
  }
}

/**
 * The shared contact / enquiry form. Renders the category tabs, contextual
 * fields, and the single `submit_enquiry` submission path. Used by both the
 * standalone /contact page and the embedded form beneath the FAQ.
 *
 * Centre partnership tab redirects to the dedicated /apply-partner-centre
 * page — it collects more comprehensive centre details than a contact form.
 */
export default function ContactForm() {
  const [params] = useSearchParams();
  const [category, setCategory] = useState<Category>(() => topicToCategory(params.get('topic')));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instructorRef, setInstructorRef] = useState('');
  const [affiliated, setAffiliated] = useState('');
  const [message, setMessage] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    if (category === 'centre_partnership') return false;  // routes elsewhere; no submit here
    const base = name.trim().length > 1 && email.includes('@') && message.trim().length > 4;
    if (!base) return false;
    if (category === 'instructor_registration') return !!instructorRef.trim();
    return true;
  }, [name, email, message, category, instructorRef]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('submit_enquiry', {
      _category: category,
      _contact_name: name,
      _contact_email: email,
      _message: message,
      _contact_phone: phone || null,
      _organisation: null,
      _state: null,
      _instructor_ref: category === 'instructor_registration' ? instructorRef : null,
      _affiliated_centre: category === 'instructor_registration' ? affiliated : null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setName(''); setEmail(''); setPhone('');
    setInstructorRef(''); setAffiliated(''); setMessage('');
  }

  return (
    <>
      <div className="mas-segmented" role="tablist" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={category === t.key ? 'is-active' : ''}
            onClick={() => { setCategory(t.key); setDone(false); setError(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mas-contact-card">
      <p className="mas-lede" style={{ maxWidth: '60ch' }}>{INTRO[category]}</p>

      {category === 'centre_partnership' ? (
        <div style={{
          marginTop: '1rem',
          padding: '2rem',
          background: '#f8fafd',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '640px',
        }}>
          <p style={{ margin: '0 0 1.2rem', color: 'var(--mas-muted, #5b6472)', lineHeight: 1.55 }}>
            Our centre partnership application has moved to its own page. It captures
            your centre&rsquo;s details, photos, and pool specifications so the review
            team has everything they need up front.
          </p>
          <Link to="/apply-partner-centre" style={{
            display: 'inline-block',
            padding: '0.8rem 2rem',
            background: 'var(--mas-navy, #1E2752)',
            color: '#fff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 700,
          }}>
            Apply to become a partner centre →
          </Link>
        </div>
      ) : done ? (
        <div className="mas-alert is-success" style={{ maxWidth: '640px', marginTop: '1rem' }}>
          <div className="mas-alert-body">
            <p className="mas-alert-title"><EditableText keyName="contact.success.title">Thank you — your enquiry is in.</EditableText></p>
            <p className="mas-alert-text"><EditableText keyName="contact.success.body">We&rsquo;ll be in touch by email. You can send another enquiry any time.</EditableText></p>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: '720px', marginTop: '1rem' }}>
          {error && (
            <div className="mas-alert is-danger" style={{ marginBottom: '1rem' }}>
              <div className="mas-alert-body"><p className="mas-alert-text">{error}</p></div>
            </div>
          )}

          <div className="mas-form-grid">
            <div className="mas-field">
              <label htmlFor="name" className="mas-field-label">Your name <span className="mas-req">*</span></label>
              <input id="name" className="mas-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="mas-field">
              <label htmlFor="email" className="mas-field-label">Email <span className="mas-req">*</span></label>
              <input id="email" type="email" className="mas-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>

            <div className="mas-field">
              <label htmlFor="phone" className="mas-field-label">Phone <span className="mas-field-opt">(optional)</span></label>
              <input id="phone" type="tel" className="mas-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 012-345 6789" />
            </div>

            {category === 'instructor_registration' && (
              <>
                <div className="mas-field">
                  <label htmlFor="iref" className="mas-field-label">MAS instructor ID <span className="mas-req">*</span></label>
                  <input id="iref" className="mas-input" value={instructorRef} onChange={(e) => setInstructorRef(e.target.value)} placeholder="Your certification number" />
                </div>
                <div className="mas-field">
                  <label htmlFor="aff" className="mas-field-label">Where you teach <span className="mas-field-opt">(optional)</span></label>
                  <input id="aff" className="mas-input" value={affiliated} onChange={(e) => setAffiliated(e.target.value)} placeholder="Centre or swim school" />
                </div>
              </>
            )}

            <div className="mas-field mas-col-2">
              <label htmlFor="msg" className="mas-field-label">Message <span className="mas-req">*</span></label>
              <textarea id="msg" className="mas-input" rows={5} value={message}
                onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" style={{ resize: 'vertical' }} />
            </div>
          </div>

          <div className="mas-form-actions" style={{ marginTop: '1.25rem' }}>
            <button type="submit" className="mas-btn-primary" disabled={!canSubmit || busy}>
              {busy ? 'Sending…' : 'Send enquiry'}
            </button>
          </div>
        </form>
      )}
      </div>
    </>
  );
}

// Keep STATES for reference — no longer used since centre_partnership tab
// redirects to /apply-partner-centre. Left in for future centre-related fields.
void STATES;
