/**
 * End-to-end smoke test of the core path:
 * new document → draw → new layer → draw (multiply) → undo/redo → save → close → open → export PNG.
 * Native file dialogs are stubbed in the Electron main process.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { compositePixel, type Pixel } from '../../src/core/blend';
import { readCforge } from '../../src/core/cforge';

const W = 800;
const H = 600;

let app: ElectronApplication;
let page: Page;
let work: string;

async function stubSaveDialog(file: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, file);
}

async function stubOpenDialog(file: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [p],
    })) as typeof dialog.showOpenDialog;
  }, file);
}

/** Screen position of a document coordinate (the view is unrotated in this test). */
async function docToScreen(x: number, y: number) {
  const b = await page.evaluate(() => {
    const c = (
      window as unknown as {
        __cforgeCanvas: { documentBounds(): { x: number; y: number; w: number; h: number } };
      }
    ).__cforgeCanvas;
    return c.documentBounds();
  });
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + b.x + (x / W) * b.w, y: box.y + b.y + (y / H) * b.h };
}

async function drawLine(from: [number, number], to: [number, number]) {
  const a = await docToScreen(...from);
  const b = await docToScreen(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 40 });
  await page.mouse.up();
}

async function layerCount() {
  return page.locator('.layer[data-layer-id]').count();
}

test.beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'cforge-e2e-'));
  const args = ['.'];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  app = await electron.launch({
    args,
    env: { ...process.env, CFORGE_USER_DATA: path.join(work, 'userdata') },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (!app) return;
  // discard anything unsaved so the window can close without a native prompt
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 1,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  });
  await app.close();
});

test('new → draw → layer → save → close → open → export PNG', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- new document
  await expect(page.getByRole('button', { name: 'Neues Dokument (Strg+N)' })).toBeVisible();
  await page.keyboard.press('Control+n');
  await page.getByLabel('Breite (px)').fill(String(W));
  await page.getByLabel('Höhe (px)').fill(String(H));
  await page.getByLabel('Name', { exact: true }).fill('Smoke');
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await expect(page.getByRole('tab', { name: /Smoke/ })).toBeVisible();
  await page.keyboard.press('Control+0');

  // --- stroke 1: navy ink, horizontal
  await page.locator('[data-brush="ink"]').click();
  await page.getByLabel('Hex').fill('#1f2a44');
  await page.getByLabel('Hex').press('Enter');
  await drawLine([100, 300], [700, 300]);

  // --- new layer + stroke 2: red ink, vertical, multiply
  expect(await layerCount()).toBe(1);
  await page.locator('canvas[data-testid="canvas"]').focus();
  await page.keyboard.press('Control+Shift+N');
  expect(await layerCount()).toBe(2);
  await page.getByLabel('Füllmethode').selectOption('multiply');
  await page.getByLabel('Hex').fill('#ff0000');
  await page.getByLabel('Hex').press('Enter');
  await drawLine([400, 100], [400, 500]);

  // --- undo / redo round trip of the last stroke
  await page.locator('canvas[data-testid="canvas"]').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');

  // --- save
  const docPath = path.join(work, 'smoke.cforge');
  await stubSaveDialog(docPath);
  await page.keyboard.press('Control+s');
  await expect.poll(() => existsSync(docPath)).toBe(true);
  await expect(page.locator('.tab .dirty')).toHaveCount(0);
  const saved = readCforge(new Uint8Array(readFileSync(docPath)));
  expect(saved.manifest.width).toBe(W);
  expect(saved.manifest.layers.map((l) => l.blend)).toEqual(['normal', 'multiply']);

  // --- close and reopen
  await page.keyboard.press('Control+w');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await stubOpenDialog(docPath);
  await page.keyboard.press('Control+o');
  await expect(page.getByRole('tab', { name: /smoke/ })).toBeVisible();
  expect(await layerCount()).toBe(2);

  // --- export PNG
  const pngPath = path.join(work, 'smoke.png');
  await stubSaveDialog(pngPath);
  await page.keyboard.press('Control+Shift+E');
  await page.getByRole('button', { name: 'Exportieren …' }).click();
  await expect.poll(() => existsSync(pngPath)).toBe(true);

  const png = PNG.sync.read(readFileSync(pngPath));
  expect(png.width).toBe(W);
  expect(png.height).toBe(H);
  const px = (x: number, y: number): Pixel => {
    const i = (y * W + x) * 4;
    return [png.data[i]! / 255, png.data[i + 1]! / 255, png.data[i + 2]! / 255, png.data[i + 3]! / 255];
  };
  const expectColor = (actual: Pixel, expected: Pixel, tol = 0.06) =>
    actual.forEach((v, i) =>
      expect(Math.abs(v - expected[i]!), `channel ${i}: ${actual} vs ${expected}`).toBeLessThan(tol),
    );

  const white: Pixel = [1, 1, 1, 1];
  const navy: Pixel = [0x1f / 255, 0x2a / 255, 0x44 / 255, 1];
  const red: Pixel = [1, 0, 0, 1];
  expectColor(px(50, 50), white);
  expectColor(px(220, 300), navy);
  expectColor(px(400, 200), compositePixel(white, red, 'multiply'));
  expectColor(px(400, 300), compositePixel(navy, red, 'multiply'));

  expect(errors).toEqual([]);
});
