import { useId, useState } from "react";
import { formatTimecode, parseTimecode } from "../../shared/timecode";

export function TimecodeInput({
  label,
  value,
  min,
  max,
  commit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  commit: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(formatTimecode(value));
  const [error, setError] = useState("");
  function apply() {
    const parsed = parseTimecode(text);
    if (parsed === null || parsed < min || parsed > max + 0.0005) {
      setError(
        `Use a time from ${formatTimecode(min)} to ${formatTimecode(max)}.`,
      );
      setText(formatTimecode(value));
    } else {
      setError("");
      commit(Math.min(parsed, max));
      setText(formatTimecode(parsed));
    }
  }
  return (
    <div className="timecode-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setError("");
        }}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setText(formatTimecode(value));
            setError("");
          }
        }}
      />
      {error && (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
