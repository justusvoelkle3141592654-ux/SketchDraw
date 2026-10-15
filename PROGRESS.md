# Fortschritt

## Meilenstein 1 – Fundament: abgeschlossen (2026-10-15)

### Erledigt

- Electron-App (Electron 44, sandboxed Renderer, typisierte IPC-Bridge), React-UI, dunkles eigenes Design.
- Neues Dokument: 8 Vorlagen, eigene Pixelgröße, DPI, Hoch-/Querformat, Hintergrundfarbe oder transparent,
  Validierung und Warnung bei sehr großen Leinwänden.
- Mehrere Dokumente in Tabs; Warnung bei ungespeicherten Änderungen beim Schließen eines Tabs und der App
  (Speichern / Nicht speichern / Abbrechen).
- Canvas-Navigation: Zoom an Mausposition, Pan, stufenlose Drehung, Zwei-Finger-Geste, an Fenster anpassen,
  100 %, Ansicht zurücksetzen; DPI-bewusste Darstellung (devicePixelRatio).
- Pinsel-Engine mit Pointer Events + Coalesced Events, echter Stiftdruck bzw. simulierter Druck (Maus/Touch),
  Stabilisierung, lückenloser Abstand, Druckkurve. Presets: Bleistift, Tuschestift, Airbrush weich/hart,
  Marker, Kreide (Papierkorn), Radierer hart/weich. Stift-Radiererende radiert automatisch.
- Pinsel-Einstellungen: Größe, Deckkraft, Fluss, Härte, Abstand, Stabilisierung, Körnung, Druck→Größe,
  Min. Größe, Druck→Fluss, Druckkurve; werden als Präferenz gespeichert.
- Undo/Redo (Pinselstriche, Radieren, Ebene neu/löschen/duplizieren/verschieben/zusammenfügen/leeren,
  Eigenschaften, Hintergrund) mit Speicherbudget; Verlauf und Speicherbedarf in der Statusleiste.
- Ebenen: neu, löschen, duplizieren, umbenennen (Doppelklick/F2), ein-/ausblenden, sperren, Deckkraft,
  17 Füllmethoden (u. a. Normal, Multiplizieren, Negativ multiplizieren, Ineinanderkopieren, Addieren),
  Reihenfolge per Drag & Drop und per Pfeil-Buttons, nach unten zusammenfügen, Miniaturen.
- Natives Format `.cforge` (ZIP, versioniert, validiert, atomisch gespeichert), Öffnen/Speichern/Speichern unter,
  „Zuletzt geöffnet“ (Menü + Startbildschirm), Dateizuordnung im Installer.
- Import PNG/JPEG/WebP als neues Dokument oder als Ebene; Export PNG (Transparenz), JPEG, WebP mit Qualität.
- Pipette (Werkzeug oder Alt), Farbe per Systemfarbwähler, Hex-Eingabe, Grundpalette, zuletzt verwendete Farben.
- Befehlssystem mit sichtbaren Tastenkürzeln (Tooltips, Menü, F1-Übersicht), einklappbare Werkzeugleiste,
  Fokus-Leinwand (Tab), Linkshänder-Layout.
- Statusleiste mit Cursorposition, Eingabegerät/Druck und gemessener Eingabe→Frame-Latenz.

### Geprüfte Befehle (Linux-Container, 2026-10-15)

| Befehl                                                  | Ergebnis                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                          | 0 Fehler, 0 Warnungen                                                                                      |
| `npm run format:check`                                  | alle Dateien formatiert                                                                                    |
| `npm test`                                              | 10 Testdateien, 78 Tests bestanden                                                                         |
| `npm run build`                                         | erfolgreich (Typprüfung Renderer + Electron, Vite-Build)                                                   |
| `xvfb-run -a npx playwright test`                       | 1 E2E-Test bestanden (6 Läufe ohne Fehlschlag)                                                             |
| `electron-builder --win nsis portable --x64` (mit Wine) | `release/CanvasForge-Setup-0.1.0.exe` und `release/CanvasForge-Portable-0.1.0.exe` erzeugt (je ca. 120 MB) |

Der E2E-Test deckt ab: neues Dokument → Strich → neue Ebene (Multiplizieren) → Strich → Undo/Redo →
Speichern (`.cforge` wird gelesen und geprüft) → Tab schließen → Öffnen → PNG-Export; die exportierten
Pixel werden gegen die Referenzformel der Füllmethode geprüft.

Windows (GitHub Actions, `windows-latest`, Lauf 38708590952): Lint, Format-Prüfung, Unit-Tests, Build,
E2E-Smoke-Test und Paketierung erfolgreich; Installer und portable `.exe` als Artefakt `canvas-forge-windows`.

Nicht geprüft: Bedienung der installierten `.exe` von Hand auf Windows 11, Stift-/Touch-Hardware,
Windows-Skalierung 125/150/200 %.

## Feature-Matrix

| Block                                                                             | Status          | Anmerkung                                                                       |
| --------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| P0 Neues Dokument                                                                 | Implementiert   |                                                                                 |
| P0 Tabs, Ungespeichert-Warnung                                                    | Implementiert   |                                                                                 |
| P0 Wiederherstellung nach Absturz                                                 | Nicht umgesetzt | Meilenstein 4 (mit Autosave)                                                    |
| P0 Zoom/Pan/Drehung/Anpassen/Zurücksetzen                                         | Implementiert   | Touch-Geste nur ohne echte Touch-Hardware getestet (Unit-Test der Geometrie)    |
| P0 Pinsel (Bleistift, Tusche, Airbrush, Marker, Radierer)                         | Implementiert   |                                                                                 |
| P0 Texturpinsel                                                                   | Teilweise       | Papierkorn (Kreide); eigene Pinselspitzen/Texturen folgen in M2                 |
| P0 Smudge                                                                         | Nicht umgesetzt | Meilenstein 2                                                                   |
| P0 Glättung, lückenlose Striche                                                   | Implementiert   |                                                                                 |
| P0 Prädiktion                                                                     | Nicht umgesetzt | Latenz wird gemessen und angezeigt                                              |
| P0 Undo/Redo                                                                      | Implementiert   | für alle vorhandenen Aktionen; Transformationen/Füllungen existieren noch nicht |
| P0 Ebenen-Editor inkl. Drag & Drop und Füllmethoden                               | Implementiert   |                                                                                 |
| P0 `.cforge` mit Versionierung, atomisch                                          | Implementiert   |                                                                                 |
| P0 Import PNG/JPEG/WebP, Export PNG/JPEG/WebP                                     | Implementiert   |                                                                                 |
| P0 Autosave                                                                       | Nicht umgesetzt | Meilenstein 4                                                                   |
| P0 Zuletzt geöffnet, Fehlermeldungen, sicherer Export                             | Implementiert   |                                                                                 |
| P1 Pipette                                                                        | Implementiert   |                                                                                 |
| P1 Farbwähler Kreis/Quadrat, HSV/RGB, eigene Paletten                             | Teilweise       | Systemfarbwähler, Hex, Grundpalette, zuletzt verwendet                          |
| P1 Pinsel-Bibliothek (Favoriten, eigene Presets, JSON)                            | Teilweise       | Presets mit Vorschau, Einstellungen, Zurücksetzen                               |
| P1 Hilfslinien, Symmetrie, Formen, Füllung, Verlauf, Text                         | Nicht umgesetzt | Meilenstein 3                                                                   |
| P1 Auswahl, Transformation, Zuschneiden, Anpassungen                              | Nicht umgesetzt | Meilenstein 3                                                                   |
| P1 Ebenengruppen, Alpha-Lock, Clipping, Masken                                    | Nicht umgesetzt | Meilenstein 3                                                                   |
| P2 (PSD, TIFF, Referenzbild, Zeitraffer, Flipbook, Drag & Drop, Zwischenablage)   | Nicht umgesetzt | Meilensteine 4–5; Datei-Drag-&-Drop meldet das derzeit sichtbar                 |
| UX: Kommandoleiste, einklappbare Werkzeugleiste, Tooltips, Kürzel, Fokus-Leinwand | Implementiert   |                                                                                 |
| UX: frei positionierbare Panels                                                   | Teilweise       | feste, einklappbare Panel-Spalte                                                |
| UX: Steuerpucks, Orbit-Radialmenü                                                 | Nicht umgesetzt | Meilensteine 2 und 4                                                            |
| UX: Linkshänder-Layout                                                            | Implementiert   |                                                                                 |

## Offene Risiken

- Kein Test auf echtem Windows/Stift in dieser Umgebung (siehe oben).
- Sehr große Leinwände: pro Dokument werden neben den Ebenen drei Strichpuffer und ein Composite-Cache
  in voller Größe gehalten.
- `.exe` ist unsigniert (SmartScreen-Warnung).
- Dev-Abhängigkeiten melden bei `npm audit` bekannte Schwachstellen (u. a. in Test-/Build-Werkzeugen);
  die ausgelieferten Laufzeitpakete sind ohne Befund (`npm audit --omit=dev`).

## Nächster Schritt

Meilenstein 2 „Malen“: eigener Farbwähler (Farbkreis/Quadrat, HSV/RGB), Paletten, Smudge-Werkzeug,
Pinsel-Bibliothek mit eigenen Presets und JSON-Import/-Export, Steuerpucks für Größe/Deckkraft.
