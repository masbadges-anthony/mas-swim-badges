import { useState } from 'react';
import { FAQ_CATEGORIES } from '../data/faqs';

export default function FAQ() {
  const [open, setOpen] = useState<string | null>('parents-0');

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

      <nav className="mas-faq-jump" aria-label="FAQ categories">
        {FAQ_CATEGORIES.map((c) => (
          <a key={c.key} href={`#faq-${c.key}`} className="mas-faq-chip" style={{ ['--lvl' as string]: c.accent }}>
            {c.title}
          </a>
        ))}
      </nav>

      {FAQ_CATEGORIES.map((cat) => (
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
                    <span className="mas-faq-mark" aria-hidden="true">{isOpen ? '\u2013' : '+'}</span>
                  </button>
                  {isOpen && <div className="mas-faq-a"><p>{it.a}</p></div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="mas-faq-foot">
        <p>Still have a question? <a href="/contact" className="mas-link">Get in touch with the MAS BADGES team.</a></p>
      </div>
    </section>
  );
}
