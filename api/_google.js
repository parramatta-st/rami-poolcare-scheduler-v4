import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

const REQUIRED_ENV = [
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_AUDIENCE',
  'GOOGLE_SHEET_ID',
  'GOOGLE_DRIVE_FOLDER_ID'
];

export function getMissingEnvironmentVariables() {
  return REQUIRED_ENV.filter(name => !String(process.env[name] || '').trim());
}

export function getGoogleConfig() {
  const missing = getMissingEnvironmentVariables();
  if (missing.length) {
    const error = new Error(`Missing environment variables: ${missing.join(', ')}`);
    error.code = 'MISSING_ENVIRONMENT_VARIABLES';
    error.missing = missing;
    throw error;
  }
  return {
    projectId: process.env.GCP_PROJECT_ID,
    projectNumber: process.env.GCP_PROJECT_NUMBER,
    serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    poolId: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    providerId: process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    audience: process.env.GCP_AUDIENCE,
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID
  };
}

export function getGoogleAuthClient() {
  const config = getGoogleConfig();
  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: config.audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken({ audience: config.audience })
    }
  });
  if (!authClient) throw new Error('Could not create Google external account client.');
  return authClient;
}

export async function getGoogleAccessToken() {
  const authClient = getGoogleAuthClient();
  const result = await authClient.getAccessToken();
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Google did not return an access token.');
  return token;
}

export async function googleRequest(options) {
  const authClient = getGoogleAuthClient();
  const response = await authClient.request(options);
  return response.data;
}

export function apiError(res, error) {
  console.error(error);
  const status = error?.response?.status || 500;
  const googleMessage = error?.response?.data?.error?.message;
  return res.status(status).json({
    ok: false,
    error: error?.code || 'GOOGLE_API_ERROR',
    message: googleMessage || error?.message || 'Google API request failed.',
    missing: error?.missing || undefined
  });
}
