RAMI POOL CARE V4 - GOOGLE OIDC AUDIENCE FIX

This build fixes the error:
  invalid_grant: The audience in ID Token does not match the expected audience.

The fix separates the two different audiences correctly:

1. Google provider Allowed audience:
   https://vercel.com/success-tutoring-parramattas-projects

2. Vercel environment variable GCP_AUDIENCE:
   //iam.googleapis.com/projects/772718669372/locations/global/workloadIdentityPools/vercel/providers/vercel

The application now requests the normal Vercel team-audience token and uses the Google provider resource name only for Google's STS token exchange.

After deploying this build, keep the existing Google provider and service-account access settings, confirm the GCP_AUDIENCE variable above, and redeploy Production.
