# Canvas Forge

Raster-Zeichen- und Mal-App für Windows 11 (Electron + React + TypeScript + Canvas 2D).
Ziel: flüssiges Zeichengefühl, zuverlässiges Speichern, ruhiger Arbeitsbereich.

Stand und Feature-Matrix: [PROGRESS.md](PROGRESS.md) · Architektur und Meilensteine: [PLAN.md](PLAN.md)

## Voraussetzungen

- Node.js 22 und npm
- Für den Windows-Build auf Windows: nichts weiter.
- Für den Windows-Build unter Linux: Wine mit 32-bit-Unterstützung (`wine64` und `wine32:i386`),
  weil electron-builder den NSIS-Installer und die Exe-Ressourcen (Icon, Versionsinfo) über Wine erzeugt.

## Befehle

| Befehl                 | Zweck                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm ci`               | Abhängigkeiten installieren (inkl. Electron-Binary)                                                              |
| `npm run dev`          | Entwicklung: Vite-Dev-Server + Electron                                                                          |
| `npm run lint`         | ESLint (0 Warnungen erlaubt)                                                                                     |
| `npm run format:check` | Prettier-Prüfung                                                                                                 |
| `npm test`             | Unit-Tests (Vitest)                                                                                              |
| `npm run build`        | Typprüfung + Produktions-Build nach `dist/` und `dist-electron/`                                                 |
| `npm start`            | gebaute App starten                                                                                              |
| `npx playwright test`  | End-to-End-Smoke-Test gegen die gebaute App (vorher `npm run build`; unter Linux ohne Display mit `xvfb-run -a`) |
| `npm run dist:win`     | Build + Windows-Installer und portable `.exe` nach `release/`                                                    |
| `npm run icon`         | App-Icon `build/icon.png` neu erzeugen                                                                           |

Ergebnis von `npm run dist:win`:

- `release/CanvasForge-Setup-<version>.exe` – Installer (Installationsordner wählbar, Startmenü- und Desktop-Verknüpfung, Dateizuordnung `.cforge`)
- `release/CanvasForge-Portable-<version>.exe` – portable Version ohne Installation

Die `.exe`-Dateien sind nicht signiert; Windows SmartScreen zeigt deshalb beim ersten Start eine Warnung.

### Windows-Build über GitHub Actions

`.github/workflows/windows.yml` führt bei jedem Push auf einem Windows-Runner Lint, Format-Prüfung,
Unit-Tests, Build und den E2E-Smoke-Test aus und lädt Installer und portable `.exe` als Artefakt
`canvas-forge-windows` hoch (Actions → Lauf → Artifacts).

## Bedienung (Kurzfassung)

- **Zeichnen:** Stift, Maus oder Touch. Ohne Drucksensor wird Druck aus der Geschwindigkeit simuliert.
- **Navigation:** Mausrad = Zoom an der Mausposition, Leertaste + Ziehen = Verschieben,
  Umschalt + Leertaste + Ziehen oder Alt + Mausrad = Drehen, Zwei-Finger-Geste = Zoom/Drehen/Verschieben.
- **Pinselgröße:** `[` / `]` oder Umschalt + Mausrad. **Pipette:** Alt gedrückt halten.
- **Fokus-Leinwand:** `Tab` blendet die Oberfläche aus und wieder ein.
- Alle Tastenkürzel: `F1`.

## Latenz prüfen (manuell)

Die Statusleiste zeigt rechts die mittlere Zeit vom Eingabe-Ereignis bis zum gezeichneten Frame
(nur Renderer-Anteil, ohne Bildschirm- und Treiberlatenz) sowie die Bildrate während einer Interaktion.

1. Dokument „Bildschirm 4K“ anlegen, Tuschestift, Größe 20.
2. Schnelle, lange Kreise zeichnen.
3. Erwartung: keine Lücken im Strich, Latenzwert unter einer Frame-Dauer (≤ 16,7 ms bei 60 Hz).
   In der Linux-Testumgebung (Xvfb, Software-Rendering, Maus) wurden ca. 10 ms angezeigt; auf Windows
   mit Stift ist das noch zu messen.
