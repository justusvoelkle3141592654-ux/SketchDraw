import { useState } from 'react';
import { normalizeHex } from '../../core/color';
import { useApp } from '../../store/appStore';
import { ColorInput } from '../common';

const BASE_PALETTE = [
  '#111318',
  '#3b3f4a',
  '#7b808c',
  '#c3c6cd',
  '#ffffff',
  '#5a3825',
  '#9c5b34',
  '#d9a066',
  '#b8322f',
  '#e26a3c',
  '#f2b33d',
  '#f6e27a',
  '#3f7d3a',
  '#78b856',
  '#2f6f8f',
  '#5aa9d6',
  '#2b3a8c',
  '#6c63c7',
  '#a24f9b',
  '#e58bb4',
];

export function ColorPanel() {
  const color = useApp((s) => s.color);
  const recent = useApp((s) => s.recentColors);
  const st = useApp.getState();
  const [hexText, setHexText] = useState<string | null>(null);
  const hexValid = hexText === null || normalizeHex(hexText) !== null;
  return (
    <div>
      <div className="row" style={{ gap: 10 }}>
        <ColorInput
          className="color-current"
          label="Farbe wählen"
          value={color}
          onInput={(v) => st.setColor(v)}
          onCommit={(v) => st.commitColor(v)}
        />
        <div style={{ flex: 1 }}>
          <label className="layer-sub" htmlFor="hex-input">
            Hex
          </label>
          <input
            id="hex-input"
            className="text-input"
            value={hexText ?? color}
            aria-invalid={!hexValid}
            spellCheck={false}
            onChange={(e) => setHexText(e.target.value)}
            onBlur={() => {
              if (hexText !== null && normalizeHex(hexText)) st.commitColor(hexText);
              setHexText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          {!hexValid && <div className="msg-error">Ungültiger Hex-Wert</div>}
        </div>
      </div>
      <div className="swatches" role="group" aria-label="Grundpalette">
        {BASE_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${c === color ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`Farbe ${c}`}
            onClick={() => st.commitColor(c)}
          />
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="menu-heading" style={{ padding: '8px 0 0' }}>
            Zuletzt verwendet
          </div>
          <div className="swatches" role="group" aria-label="Zuletzt verwendete Farben">
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${c === color ? 'active' : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`Farbe ${c}`}
                onClick={() => st.commitColor(c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
