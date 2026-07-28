import { authenticationConfigured, requireAuth } from './_auth.js';
import { apiError, getGoogleConfig, getMissingEnvironmentVariables, googleRequest } from './_google.js';
import { ensureRequiredSheets } from './_sheets.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!requireAuth(req, res)) return;
  const missing = getMissingEnvironmentVariables();
  if (missing.length) {
    return res.status(503).json({ ok: false, authenticationConfigured: authenticationConfigured(), missing });
  }
  try {
    await ensureRequiredSheets();
    const { spreadsheetId, driveFolderId } = getGoogleConfig();
    const [sheetData, folderData] = await Promise.all([
      googleRequest({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties.title`,
        method: 'GET'
      }),
      googleRequest({
        url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFolderId)}?supportsAllDrives=true&fields=id,name,mimeType,driveId,capabilities(canAddChildren)`,
        method: 'GET'
      })
    ]);
    const isSharedDriveFolder = Boolean(folderData.driveId);
    return res.status(200).json({
      ok: true,
      authenticationConfigured: authenticationConfigured(),
      spreadsheetTitle: sheetData.properties?.title || '',
      tabs: (sheetData.sheets || []).map(sheet => sheet.properties?.title).filter(Boolean),
      photoFolder: {
        id: folderData.id,
        name: folderData.name,
        canAddChildren: Boolean(folderData.capabilities?.canAddChildren),
        isSharedDriveFolder,
        warning: isSharedDriveFolder ? null : 'This folder is in My Drive. Service-account photo uploads can fail because service accounts do not have Drive storage quota.'
      }
    });
  } catch (error) {
    return apiError(res, error);
  }
}
