import { useState, type ComponentProps } from 'react';

type NumericTextInputProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown' | 'min' | 'max' | 'step'
> & {
  value: number | null;
  min?: number;
  max?: number;
  integer?: boolean;
  onCommit: (value: number) => void;
};

export function NumericTextInput({
  value,
  min,
  max,
  integer = false,
  onCommit,
  ...inputProps
}: NumericTextInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft !== null) {
      const text = draft.trim();
      const numeric = Number(text);
      const validFormat = integer
        ? /^[+-]?\d+$/.test(text)
        : /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text);
      if (
        validFormat &&
        Number.isFinite(numeric) &&
        (min === undefined || numeric >= min) &&
        (max === undefined || numeric <= max)
      ) {
        onCommit(numeric);
      }
    }
    setDraft(null);
  }

  return (
    <input
      {...inputProps}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={draft ?? (value === null ? '' : String(value))}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
