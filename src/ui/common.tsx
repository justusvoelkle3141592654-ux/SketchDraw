import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DocSession } from '../editor/DocSession';
import { tip as commandTip, runCommand, command } from '../editor/commands';

/** Re-renders when the session notifies a structural change. */
export function useSessionVersion(s: DocSession | null): number {
  return useSyncExternalStore(
    (fn) => (s ? s.subscribe(fn) : () => undefined),
    () => (s ? s.getVersion() : -1),
  );
}

export function CommandButton(props: {
  id: string;
  icon: ReactNode;
  label?: string;
  showLabel?: boolean;
  active?: boolean;
  className?: string;
}) {
  const c = command(props.id);
  const enabled = c.enabled ? c.enabled() : true;
  return (
    <button
      type="button"
      className={`icon-btn ${props.className ?? ''}`}
      title={commandTip(props.id)}
      aria-label={props.label ?? c.label}
      aria-pressed={props.active === undefined ? undefined : props.active}
      disabled={!enabled}
      onClick={() => runCommand(props.id)}
    >
      {props.icon}
      {props.showLabel && <span>{props.label ?? c.label}</span>}
    </button>
  );
}

/** Range slider with numeric input. `onCommit` fires once when an interaction ends. */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** display multiplier, e.g. 100 to show 0..1 as percent */
  scale?: number;
  unit?: string;
  log?: boolean;
  onChange(v: number): void;
  onCommit?(v: number): void;
}) {
  const { min, max, log } = props;
  const scale = props.scale ?? 1;
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  const latest = useRef(props.value);
  latest.current = props.value;
  const [text, setText] = useState<string | null>(null);
  const display = Math.round(props.value * scale * 10) / 10;
  const id = `sl-${props.label.replace(/\W+/g, '-')}`;
  const commit = () => props.onCommit?.(latest.current);
  const round = (v: number) => {
    const st = props.step ?? 0;
    return st > 0 ? Math.round(v / st) * st : v;
  };
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={1000}
        value={Math.round(toPos(props.value) * 1000)}
        onChange={(e) =>
          props.onChange(Math.min(max, Math.max(min, round(fromPos(Number(e.target.value) / 1000)))))
        }
        onPointerUp={commit}
        onKeyUp={commit}
        aria-valuetext={`${display}${props.unit ?? ''}`}
      />
      <input
        className="num"
        aria-label={`${props.label} Wert`}
        value={text ?? String(display)}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (text !== null) {
            const n = Number(text.replace(',', '.'));
            if (Number.isFinite(n)) {
              const v = Math.min(max, Math.max(min, round(n / scale)));
              props.onChange(v);
              props.onCommit?.(v);
            }
          }
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

/** Modal dialog built on the native <dialog> element (focus trap + Escape for free). */
export function Dialog(props: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-labelledby={`${props.title}-h`}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
    >
      {props.open && (
        <>
          <div className="dlg-head" id={`${props.title}-h`}>
            {props.title}
          </div>
          <div className="dlg-body">{props.children}</div>
          <div className="dlg-foot">{props.footer}</div>
        </>
      )}
    </dialog>
  );
}

/** Own brand mark: a stylised nib over an arc. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#2c2f36" stroke="#4a4e58" />
      <path d="M6 23c5-9 13-13 20-12" fill="none" stroke="#e8894a" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 6l6 6-7 9-4-4z" fill="#f5a36c" />
      <circle cx="17.5" cy="13.5" r="1.6" fill="#2c2f36" />
    </svg>
  );
}

/**
 * Native colour input. `onInput` fires live while picking, `onCommit` once when the picker
 * is closed (native "change" event, which React does not expose separately).
 */
export function ColorInput(props: {
  value: string;
  className?: string;
  label: string;
  disabled?: boolean;
  onInput(v: string): void;
  onCommit(v: string): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(props.onCommit);
  commit.current = props.onCommit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = () => commit.current(el.value);
    el.addEventListener('change', fn);
    return () => el.removeEventListener('change', fn);
  }, []);
  return (
    <input
      ref={ref}
      type="color"
      className={props.className}
      aria-label={props.label}
      title={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onInput(e.target.value)}
    />
  );
}
