import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useContentOverrides } from '../lib/contentOverrides';

interface EditableTextProps {
  /** Stable override key, e.g. "home.hero.title". */
  keyName: string;
  /** Fallback text, shown when no override exists. May be passed as children instead. */
  text?: string;
  children?: string;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Inline-editable text. For normal visitors this renders the saved override (or
 * the fallback) as plain text with no editing affordance. For a system
 * administrator the text becomes click-to-edit: clicking turns it into an inline
 * editable field, Enter or blur saves via the gated `set_content_override` RPC,
 * and Escape cancels. Editing is text-content only — the component wraps the text
 * inside the surrounding element, so the element's own styles always apply.
 */
export default function EditableText({ keyName, text, children }: EditableTextProps) {
  const fallback = text ?? children ?? '';
  const { hasRole } = useAuth();
  const { getOverride, saveOverride } = useContentOverrides();
  const isAdmin = hasRole('system_admin');

  const value = getOverride(keyName, fallback);

  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fieldRef = useRef<HTMLSpanElement>(null);
  // Guards against blur firing a second commit after Enter/Escape already closed.
  const closingRef = useRef(false);

  // When entering edit mode, seed the field with the current value, focus it and
  // place the caret at the end. Done imperatively so React never re-renders the
  // contentEditable text out from under the caret while typing.
  useEffect(() => {
    if (!editing) return;
    const el = fieldRef.current;
    if (!el) return;
    el.textContent = value;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing, value]);

  // Plain text for everyone who can't edit — identical to writing the string directly.
  if (!isAdmin) return <>{value}</>;

  function startEditing() {
    if (editing || status === 'saving') return;
    closingRef.current = false;
    setStatus('idle');
    setEditing(true);
  }

  async function commit() {
    if (closingRef.current) return;
    closingRef.current = true;
    const next = (fieldRef.current?.textContent ?? '').replace(/\s+/g, ' ').trim();
    setEditing(false);
    if (next === '' || next === value) return; // nothing meaningful changed
    setStatus('saving');
    const { error } = await saveOverride(keyName, next);
    if (error) {
      // The cache is untouched, so the displayed text reverts to the prior value.
      setErrorMsg(error);
      setStatus('error');
    } else {
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1600);
    }
  }

  function cancel() {
    closingRef.current = true;
    setEditing(false);
    setStatus('idle');
  }

  if (editing) {
    return (
      <span
        // Distinct key from the display span below so React unmounts this node
        // instead of reusing it. The contentEditable text is set imperatively
        // (outside React's vdom); reusing the DOM node on exit would leave that
        // orphaned text node in place alongside React's own — the duplicate.
        key="editing"
        ref={fieldRef}
        className="mas-editable mas-editable-field"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={`Edit ${keyName}`}
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => void commit()}
      />
    );
  }

  return (
    <span
      key="display"
      className={`mas-editable mas-editable-trigger${status === 'error' ? ' is-error' : ''}`}
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
      }}
    >
      {value}
      {status === 'saving' && <span className="mas-editable-status" aria-live="polite">Saving…</span>}
      {status === 'saved' && <span className="mas-editable-status is-saved" aria-live="polite">Saved</span>}
      {status === 'error' && (
        <span className="mas-editable-status is-bad" aria-live="polite" title={errorMsg}>
          Save failed
        </span>
      )}
    </span>
  );
}
