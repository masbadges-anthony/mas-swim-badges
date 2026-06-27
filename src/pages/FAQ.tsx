import { useMemo, useState } from 'react';
import { FAQ_CATEGORIES } from '../data/faqs';
import ContactForm from '../components/ContactForm';

export default function FAQ() {
  const [open, setOpen] = useState<string | null>('general-0');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  // Flat list of matches across every category when a query is active.
  const matches = useMemo(() => {
    if (!q) return [];
    const out: { id: string; q: string; a: string; accent: string; category: string }[] = [];
    FAQ_CATEGORIES.forEach((cat) => {
      cat.items.forEach((it, i) => {
        if (it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)) {
          out.push({ id: `${cat.key}-${i}`, q: it.q, a: it.a, accent: cat.accent, category: cat.title });
        }
      });
    });
    return out;
  }, [q]);

  return (
    <section className="mas-page mas-faq">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Help &amp; answers</p>
        <h1>Frequently asked questions</h1>
        <p className="mas-lede">
          How the programme is set up, taught, and assessed — answered for parents
          and swimmers, instructors, partner centres, examiners, and the curious public.
        </p>
      </header>

      <div className="mas-faq-search">
        <input
          type="search"
          className="mas-faq-search-input"
          placeholder="Search questions and answers…"
          aria-label="Search the FAQ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isSearching && (
          <p className="mas-faq-search-count" role="status">
            {matches.length === 0
              ? 'No questions match your search'
              : `${matches.length} ${matches.length === 1 ? 'question' : 'questions'} match your search`}
          </p>
        )}
      </div>

      {!isSearching && (
        <nav className="mas-faq-jump" aria-label="FAQ categories">
          {FAQ_CATEGORIES.map((c) => (
            <a key={c.key} href={`#faq-${c.key}`} className="mas-faq-chip" style={{ ['--lvl' as string]: c.accent }}>
              {c.title}
            </a>
          ))}
        </nav>
      )}

      {isSearching ? (
        matches.length > 0 && (
          <div className="mas-faq-list mas-faq-results">
            {matches.map((m) => {
              const isOpen = open === m.id;
              return (
                <div key={m.id} className={`mas-faq-item${isOpen ? ' is-open' : ''}`} style={{ ['--lvl' as string]: m.accent }}>
                  <button className="mas-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
                    <span>
                      <span className="mas-faq-tag">{m.category}</span>
                      {m.q}
                    </span>
                    <span className="mas-faq-mark" aria-hidden="true">{isOpen ? '–' : '+'}</span>
                  </button>
                  {isOpen && <div className="mas-faq-a"><p>{m.a}</p></div>}
                </div>
              );
            })}
          </div>
        )
      ) : (
        FAQ_CATEGORIES.map((cat) => (
          <section key={cat.key} id={`faq-${cat.key}`} className="mas-faq-cat" style={{ ['--lvl' as string]: cat.accent }}>
            <div className="mas-faq-cat-head">
              <h2>{cat.title}</h2>
              <p>{cat.intro}</p>
            </div>
            <div className="mas-faq-list">
              {cat.items.map((it, i) => {
                const id = `${cat.key}-${i}`;
                const isOpen = open === id;
                return (
                  <div key={id} className={`mas-faq-item${isOpen ? ' is-open' : ''}`}>
                    <button className="mas-faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
                      <span>{it.q}</span>
                      <span className="mas-faq-mark" aria-hidden="true">{isOpen ? '–' : '+'}</span>
                    </button>
                    {isOpen && <div className="mas-faq-a"><p>{it.a}</p></div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <div className="mas-faq-foot">
        <p>Still have a question? Send it straight to the MAS BADGES team using the form below.</p>
      </div>

      {/* The same contact form as the /contact page (one shared component, one
          `submit_enquiry` path), embedded beneath the FAQ for convenience. */}
      <section className="mas-faq-contact" aria-labelledby="faq-contact-heading">
        <div className="mas-faq-contact-head">
          <h2 id="faq-contact-heading">Get in touch</h2>
          <p className="mas-lede">
            Didn’t find your answer above? Choose the option that fits and your
            enquiry goes straight to the right person at Malaysia Aquatics.
          </p>
        </div>
        <ContactForm />
      </section>
    </section>
  );
}
