# Canvas Forge – Plan

Raster-Zeichen- und Mal-App für Windows 11 (Electron). Dieses Dokument beschreibt Architektur,
Meilensteine, Risiken und bewusst akzeptierte Kompromisse.

## Bestandsaufnahme (Start)

- Repository war leer (nur `.git`), kein bestehender Stack → keine Migration nötig.
- Entwicklungsumgebung: Linux-Container (Ubuntu 24.04), Node 22, kein Windows. Windows-Builds werden
  per `electron-builder` mit Wine (wine64 + wine32) erzeugt; ein Test auf echtem Windows ist hier
  nicht möglich.
- Referenzbilder liegen lokal unter `reference/` (nicht versioniert, siehe `reference/README.md`).
  Sie dienen nur als Funktionsreferenz: Werkzeugleiste oben, Pinsel-Palette links, Ebenen-Panel,
  Farbpanel, Steuerpucks, radiales Schnellmenü unten links.

## Architektur

```
electron/            Hauptprozess (Node) – Fenster, Dateidialoge, atomisches Schreiben, Zuletzt-geöffnet
  main.ts            BrowserWindow (contextIsolation, sandbox, kein nodeIntegration), IPC-Handler
  preload.ts         schmale, typisierte Bridge (window.cforge) – einziger Weg vom Renderer zu Node
  files.ts           Pfadvalidierung, atomicWrite (Temp-Datei → fsync → rename)
src/core/            reine, DOM-freie Logik (vollständig unit-getestet)
  geometry.ts        Matrizen, Ansicht (Zoom/Pan/Drehung), Gesten, Rechtecke
  color.ts           Hex/RGB/HSV
  brush/             Pinsel-Presets, Druckkurve, simulierter Druck, StrokeEngine (Glättung + Abstand)
  history.ts         Undo/Redo mit Eintrags- und Speicherbudget, Gespeichert-Markierung
  layers.ts          Ebenen-Stapel (generisch über die Pixel-Oberfläche)
  blend.ts           Füllmethoden: Mapping auf Canvas-Composite + Referenzformeln (W3C)
  cforge.ts          natives Dateiformat (.cforge), Validierung, Versionierung
  docPresets.ts      Dokumentvorlagen, Validierung, Speicherwarnung
src/render/          Canvas-2D-Schicht: Oberflächen, Pinselstempel, Papierkorn, Compositor
src/editor/          Dokument-Sitzung, Pinselstrich-Pipeline, Canvas-Controller, Befehle, Dateiaktionen
src/store/           Zustand-Store (UI-Zustand, Pinsel, Farbe, Präferenzen)
src/ui/              React-Komponenten (Leisten, Panels, Dialoge)
tests/unit/          Vitest (Node)
tests/e2e/           Playwright gegen die gebaute Electron-App
```

### Render- und Strich-Pipeline

1. Pointer Events (inkl. `getCoalescedEvents`) → Dokumentkoordinaten über die inverse Ansichtsmatrix.
2. Druck: Stift = echter Druck; Maus/Touch = simulierter Druck (Geschwindigkeit + Einlauf).
3. `StrokeEngine`: exponentielle Stabilisierung, Interpolation in Abständen von `spacing × Durchmesser`
   → keine Lücken bei schnellen Strichen.
4. Stempel (vorgerenderte radiale Spitzen) → `raw`-Puffer, optional Papierkorn (`grained`),
   dann `preview = Ebene ⊕ Strich × Deckkraft` – nur in den seit dem letzten Frame geänderten Regionen.
5. Compositor hält ein zwischengespeichertes Gesamtbild und setzt nur geänderte Regionen neu zusammen.
   Die Anzeige zeichnet dieses Bild einmal pro `requestAnimationFrame` mit der Ansichtstransformation.
   → Kein vollständiger Mehr-Ebenen-Redraw pro Pointer-Event.
6. Strichende: Vorschau-Region wird in die Ebene kopiert; Vorher/Nachher-Pixel der Region werden als
   ein Undo-Schritt gespeichert.

### Dateiformat `.cforge` (Version 1)

ZIP-Container: `manifest.json` (Format-ID, Version, Größe, DPI, Hintergrund, Ebenen mit Name/Sichtbarkeit/
Sperre/Deckkraft/Füllmethode, aktive Ebene, Pinselreferenz, Zeitstempel), `layers/<id>.png` (volle Auflösung,
verlustfrei), `thumbnail.png`. Neuere Formatversionen werden mit klarer Meldung abgelehnt, ältere über
`migrateManifest` hochgezogen. Speichern ist atomisch.

### Sicherheit

`contextIsolation`, `sandbox`, kein `nodeIntegration`, CSP ohne Inline-Skripte (Produktion), Navigation und
neue Fenster blockiert, Berechtigungsanfragen abgelehnt. Der Hauptprozess schreibt nur auf Pfade, die der
Nutzer in dieser Sitzung per Dialog gewählt oder geöffnet hat; Endungen und Pfade werden validiert.

## Meilensteine

1. **Fundament** – App startet, neues Dokument, Canvas-Navigation, drucksensitive Pinsel, Undo/Redo,
   Ebenen, natives Speichern/Öffnen, PNG-Export. _(abgeschlossen, siehe PROGRESS.md)_
2. **Malen** – Farbwähler (Kreis/Quadrat, HSV/RGB), Paletten, Smudge, Texturpinsel mit eigener Spitze,
   Pinsel-Bibliothek (Favoriten, eigene Presets, JSON-Import/-Export), konfigurierbare Kürzel, Steuerpucks.
3. **Bearbeiten** – Auswahl (Rechteck/Lasso/Zauberstab), Transformieren, Füllen, Formen, Hilfslinien,
   Symmetrie, Ebenengruppen, Alpha-Lock, Clipping, Masken.
4. **Pro-Arbeitsfluss** – frei positionierbare Panels, Orbit-Radialmenü, Autosave + Wiederherstellung,
   Präferenzen, Drag & Drop, Zwischenablage, Performance-Härtung (Kacheln), Zugänglichkeit.
5. **Animation & Verpackung** – Flipbook, Zeitraffer, Release Notes, Handbuch, finaler Installer.

## Risiken

| Risiko                                                                                      | Gegenmaßnahme                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Sehr große Leinwände (z. B. 16k²) sprengen GPU-/RAM-Budget (Ebene + 3 Strichpuffer + Cache) | Warnung ab 40 MP, Limit 16384 px, Undo-Speicherbudget (768 MB); Kachelung in M4    |
| Drucksensitivität hängt von Treiber/Windows Ink ab                                          | Pointer Events als Standardweg; Druck wird in der Statusleiste angezeigt           |
| Kein Windows-Testsystem in der Entwicklungsumgebung                                         | E2E unter Linux/Xvfb; Windows-Installer gebaut, aber manuell auf Windows zu prüfen |
| Unsigned `.exe` → SmartScreen-Warnung                                                       | Code-Signing-Zertifikat nötig (externe Kosten, nicht Teil des Projekts)            |
| Canvas-2D-Compositing ist 8 bit, vormultipliziert                                           | Akzeptiert; reicht für Skizzen/Illustration                                        |

## Akzeptierte Kompromisse

- Canvas 2D statt WebGL: einfacher, robust, ohne Flags; Füllmethoden kommen direkt aus Chromium.
- Ein Undo-Schritt speichert Vorher/Nachher-Pixel des Strich-Rechtecks (einfach, speicherintensiver als Deltas).
- Ebenen-Verschieben/-Löschen etc. speichern Referenzen statt Pixelkopien (günstig).
- Prädiktion (Vorhersage der Stiftposition) ist noch nicht umgesetzt; die Latenz wird gemessen und angezeigt.
- Stift-Neigung/-Drehung werden noch nicht ausgewertet (geplant in P2).
