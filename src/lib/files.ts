import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { getCategories } from './db';
import { categoryName, type Strings } from './i18n';
import type { Sheet } from './import';
import { buildTemplate, isCsv, readSpreadsheet } from './spreadsheet';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Hands a generated file to the user: a download on web, the share sheet on
 * phones (save to Files, send by WhatsApp, email…). False if the phone can't share.
 */
export async function saveFile(
  name: string,
  content: string | Uint8Array,
  opts: { mimeType: string; uti?: string; dialogTitle?: string },
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content as BlobPart], { type: opts.mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: opts.mimeType, UTI: opts.uti, dialogTitle: opts.dialogTitle });
  return true;
}

/** Reads a file chosen with expo-document-picker into spreadsheet sheets. */
export async function readPickedSpreadsheet(asset: DocumentPickerAsset): Promise<Sheet[]> {
  const csv = isCsv(asset.name);
  if (Platform.OS === 'web' && asset.file) {
    return csv
      ? readSpreadsheet(asset.name, { text: await asset.file.text() })
      : readSpreadsheet(asset.name, { bytes: new Uint8Array(await asset.file.arrayBuffer()) });
  }
  const file = new File(asset.uri);
  return csv
    ? readSpreadsheet(asset.name, { text: await file.text() })
    : readSpreadsheet(asset.name, { bytes: await file.bytes() });
}

/** Builds the Excel template in the app's language and hands it to the user. */
export async function downloadTemplate(db: SQLiteDatabase, t: Strings): Promise<boolean> {
  const categories = await getCategories(db, 'expense');
  const bytes = buildTemplate(t, categories.map((c) => categoryName(t, c.id, c.name)));
  return saveFile(t.importer.template.fileName, bytes, {
    mimeType: XLSX_MIME,
    uti: 'org.openxmlformats.spreadsheetml.sheet',
    dialogTitle: t.importer.downloadTemplate,
  });
}
