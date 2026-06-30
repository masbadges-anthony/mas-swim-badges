// Compact horizontal progress strip of named milestones. Each step renders
// filled (green) when its boolean signal is true and muted (grey) when false.
// Built reusable so later session/oversight screens can drop it in beside a
// dense table row.
export interface Checkpoint {
  key: string;
  label: string;
  done: boolean;
}

export default function CheckpointBar({ steps }: { steps: Checkpoint[] }) {
  return (
    <ol className="mas-checkpoints" aria-label="Session progress">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`mas-checkpoint${s.done ? ' is-done' : ''}`}
          aria-label={`${s.label}: ${s.done ? 'done' : 'pending'}`}
        >
          <span className="mas-checkpoint-dot" aria-hidden="true">
            {s.done ? '✓' : i + 1}
          </span>
          <span className="mas-checkpoint-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
