import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * OnboardingQuiz — first-login theory quiz for instructors and examiners.
 *
 * Flow: resolve the outstanding role (get_onboarding_status) → draw a quiz
 * (start_quiz_attempt) → collect answers → grade (submit_quiz_attempt) →
 * reveal the key. Unlimited retakes on a fail. On a pass, the backend flips
 * onboarding_checkpoint.quiz_passed; onComplete lets the host re-check the gate.
 *
 * Parameters (draw size, pass mark) live in Manual Appendix F and are enforced
 * server-side — this component never hard-codes them.
 */

type RoleKind = 'instructor' | 'examiner';

interface DrawnQuestion {
  attempt_id: string;
  question_id: string;
  category: string;
  stem: string;
  options: string[];
}

interface ResultRow {
  score: number;
  pass_mark: number;
  passed: boolean;
  question_id: string;
  your_answer: number;
  correct_index: number;
  is_correct: boolean;
}

interface OnboardingRow {
  role_kind: RoleKind;
  quiz_passed: boolean;
  coc_accepted: boolean;
  activated: boolean;
  outstanding: string[];
}

const NAVY = '#1E2752';
const RED = '#C62026';
const GOLD = '#F9C610';
const OK = '#1A7F4B';
const LINE = '#C7CEDD';
const TINT = '#F2F4F8';

type Phase = 'loading' | 'noquiz' | 'ready' | 'submitting' | 'results' | 'error';

interface Props {
  /** Force a role; if omitted, the outstanding role is derived from the gate. */
  role?: RoleKind;
  /** Called when the user has no quiz outstanding or passes and continues. */
  onComplete?: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export default function OnboardingQuiz({ role: roleProp, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [role, setRole] = useState<RoleKind | null>(roleProp ?? null);
  const [questions, setQuestions] = useState<DrawnQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<{ score: number; pass_mark: number; passed: boolean } | null>(null);
  const [err, setErr] = useState('');

  const resolveRole = useCallback(async (): Promise<RoleKind | null> => {
    if (roleProp) return roleProp;
    const { data, error } = await supabase.rpc('get_onboarding_status');
    if (error) throw error;
    const rows = (data ?? []) as OnboardingRow[];
    const pending = rows.find((r) => r.outstanding?.includes('quiz'));
    return pending ? pending.role_kind : null;
  }, [roleProp]);

  const startAttempt = useCallback(async (r: RoleKind) => {
    setErr('');
    setPhase('loading');
    const { data, error } = await supabase.rpc('start_quiz_attempt', { p_role: r });
    if (error) {
      setErr(error.message);
      setPhase('error');
      return;
    }
    const qs = (data ?? []) as DrawnQuestion[];
    if (qs.length === 0) {
      setPhase('noquiz');
      return;
    }
    setQuestions(qs);
    setAttemptId(qs[0].attempt_id);
    setAnswers(new Array(qs.length).fill(null));
    setResults([]);
    setSummary(null);
    setPhase('ready');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await resolveRole();
        if (cancelled) return;
        if (!r) {
          setPhase('noquiz');
          return;
        }
        setRole(r);
        await startAttempt(r);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveRole, startAttempt]);

  const answeredCount = answers.filter((a) => a !== null).length;
  const allAnswered = answers.length > 0 && answeredCount === answers.length;

  const choose = (qi: number, oi: number) => {
    if (phase !== 'ready') return;
    setAnswers((prev) => {
      const next = [...prev];
      next[qi] = oi;
      return next;
    });
  };

  const submit = async () => {
    if (!attemptId || !allAnswered) return;
    setPhase('submitting');
    const { data, error } = await supabase.rpc('submit_quiz_attempt', {
      p_attempt: attemptId,
      p_answers: answers as number[],
    });
    if (error) {
      setErr(error.message);
      setPhase('error');
      return;
    }
    const rows = (data ?? []) as ResultRow[];
    setResults(rows);
    if (rows.length) {
      setSummary({ score: rows[0].score, pass_mark: rows[0].pass_mark, passed: rows[0].passed });
    }
    setPhase('results');
  };

  const roleLabel = role === 'examiner' ? 'Examiner' : 'Instructor';

  // ── shells ────────────────────────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div style={S.wrap}>
      <div style={S.card}>{children}</div>
    </div>
  );

  if (phase === 'loading') {
    return shell(<p style={S.muted}>Loading your quiz…</p>);
  }

  if (phase === 'error') {
    return shell(
      <>
        <h2 style={S.h2}>Something went wrong</h2>
        <p style={{ ...S.muted, color: RED }}>{err}</p>
        <button style={S.primary} onClick={() => role && startAttempt(role)}>
          Try again
        </button>
      </>,
    );
  }

  if (phase === 'noquiz') {
    return shell(
      <>
        <h2 style={S.h2}>You&rsquo;re all set</h2>
        <p style={S.muted}>There is no onboarding quiz outstanding on your account.</p>
        {onComplete && (
          <button style={S.primary} onClick={onComplete}>
            Continue
          </button>
        )}
      </>,
    );
  }

  if (phase === 'results' && summary) {
    const byId = new Map(results.map((r) => [r.question_id, r]));
    return shell(
      <>
        <div style={{ ...S.banner, background: summary.passed ? OK : RED }}>
          {summary.passed ? 'Passed' : 'Not passed'} — {summary.score} / {questions.length}
          <span style={S.bannerSub}>pass mark {summary.pass_mark}</span>
        </div>
        <p style={S.muted}>
          {summary.passed
            ? 'Your onboarding quiz is complete. Review the answers below if you like.'
            : 'Review the answers below, then try again — there is no limit on attempts.'}
        </p>

        <ol style={S.list}>
          {questions.map((q) => {
            const r = byId.get(q.question_id);
            return (
              <li key={q.question_id} style={S.reviewItem}>
                <div style={S.category}>{q.category}</div>
                <div style={S.stem}>{q.stem}</div>
                <div>
                  {q.options.map((opt, oi) => {
                    const isCorrect = r?.correct_index === oi;
                    const isYours = r?.your_answer === oi;
                    const bg = isCorrect ? '#E6F4EC' : isYours ? '#FBE9EA' : 'transparent';
                    const bd = isCorrect ? OK : isYours ? RED : LINE;
                    return (
                      <div key={oi} style={{ ...S.reviewOpt, background: bg, borderColor: bd }}>
                        <span style={S.letter}>{LETTERS[oi]}</span>
                        <span>{opt}</span>
                        {isCorrect && <span style={{ ...S.tag, color: OK }}>correct</span>}
                        {isYours && !isCorrect && <span style={{ ...S.tag, color: RED }}>your answer</span>}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>

        {summary.passed ? (
          onComplete && (
            <button style={S.primary} onClick={onComplete}>
              Continue
            </button>
          )
        ) : (
          <button style={S.primary} onClick={() => role && startAttempt(role)}>
            Try again
          </button>
        )}
      </>,
    );
  }

  // ── ready / submitting: the quiz itself ─────────────────────────────────────
  const submitting = phase === 'submitting';
  return shell(
    <>
      <h2 style={S.h2}>{roleLabel} Onboarding Quiz</h2>
      <p style={S.muted}>
        Answer all {questions.length} questions. You can retake the quiz as many times as you need;
        the correct answers are shown after you submit.
      </p>

      <div style={S.progressWrap}>
        <div style={{ ...S.progressBar, width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>
      <div style={S.progressText}>
        {answeredCount} / {questions.length} answered
      </div>

      <ol style={S.list}>
        {questions.map((q, qi) => (
          <li key={q.question_id} style={S.item}>
            <div style={S.category}>{q.category}</div>
            <div style={S.stem}>{q.stem}</div>
            <div>
              {q.options.map((opt, oi) => {
                const selected = answers[qi] === oi;
                return (
                  <label
                    key={oi}
                    style={{
                      ...S.opt,
                      borderColor: selected ? NAVY : LINE,
                      background: selected ? TINT : '#fff',
                      cursor: submitting ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      checked={selected}
                      disabled={submitting}
                      onChange={() => choose(qi, oi)}
                      style={S.radio}
                    />
                    <span style={S.letter}>{LETTERS[oi]}</span>
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <button
        style={{ ...S.primary, opacity: allAnswered && !submitting ? 1 : 0.5 }}
        disabled={!allAnswered || submitting}
        onClick={submit}
      >
        {submitting ? 'Submitting…' : allAnswered ? 'Submit quiz' : `Answer all ${questions.length} to submit`}
      </button>
    </>,
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', justifyContent: 'center', padding: '24px 16px' },
  card: {
    width: '100%',
    maxWidth: 720,
    background: '#fff',
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    padding: 24,
    fontFamily: 'Arial, sans-serif',
    color: '#1c2230',
  },
  h2: { color: NAVY, fontSize: 20, margin: '0 0 8px' },
  muted: { color: '#5a6478', fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' },
  progressWrap: { height: 6, background: TINT, borderRadius: 999, overflow: 'hidden' },
  progressBar: { height: '100%', background: GOLD, transition: 'width .2s ease' },
  progressText: { fontSize: 12, color: '#5a6478', margin: '6px 0 8px' },
  list: { listStyle: 'none', padding: 0, margin: '8px 0 20px' },
  item: { padding: '16px 0', borderTop: `1px solid ${LINE}` },
  reviewItem: { padding: '16px 0', borderTop: `1px solid ${LINE}` },
  category: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: NAVY,
    background: TINT,
    padding: '2px 8px',
    borderRadius: 999,
    marginBottom: 8,
  },
  stem: { fontSize: 15, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.4 },
  opt: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    fontSize: 14,
  },
  reviewOpt: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    fontSize: 14,
  },
  radio: { accentColor: NAVY, width: 16, height: 16, flexShrink: 0 },
  letter: { fontWeight: 700, color: NAVY, width: 16, flexShrink: 0 },
  tag: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  primary: {
    background: NAVY,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  banner: {
    color: '#fff',
    borderRadius: 8,
    padding: '14px 16px',
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  bannerSub: { fontSize: 13, fontWeight: 500, opacity: 0.9 },
};
