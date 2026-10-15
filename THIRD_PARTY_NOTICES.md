# Third-Party Notices

Mit der App ausgelieferte Komponenten (im Renderer-Bundle bzw. als Laufzeit):

| Paket        | Version | Lizenz | Zweck                                                                                                                      |
| ------------ | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Electron     | 44.4.5  | MIT    | Desktop-Laufzeit (enthält Chromium und Node.js; deren Lizenzen liegen dem Electron-Paket als `LICENSES.chromium.html` bei) |
| react        | 19.1.1  | MIT    | UI                                                                                                                         |
| react-dom    | 19.1.1  | MIT    | UI                                                                                                                         |
| scheduler    | 0.26.0  | MIT    | Abhängigkeit von react-dom                                                                                                 |
| zustand      | 5.0.8   | MIT    | Zustandsverwaltung                                                                                                         |
| fflate       | 0.8.3   | MIT    | ZIP für das `.cforge`-Format                                                                                               |
| lucide-react | 0.544.0 | ISC    | Icons der Bedienoberfläche                                                                                                 |

Werkzeuge nur für Entwicklung/Build (nicht ausgeliefert): Vite, TypeScript, Vitest, Playwright,
ESLint, Prettier, electron-builder, pngjs.

Pinsel-Presets, App-Icon, Farbpalette und Bedienoberfläche sind eigene Arbeiten dieses Projekts.
