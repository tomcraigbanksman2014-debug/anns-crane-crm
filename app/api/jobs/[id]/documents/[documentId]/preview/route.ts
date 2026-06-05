13:04:30.523 Running build in Washington, D.C., USA (East) – iad1 (Turbo Build Machine)
13:04:30.524 Build machine configuration: 30 cores, 60 GB
13:04:30.625 Cloning github.com/tomcraigbanksman2014-debug/anns-crane-crm (Branch: main, Commit: 18d44b1)
13:04:31.416 Cloning completed: 790.000ms
13:04:31.829 Restored build cache from previous deployment (DbAWvqt9eJEnFfFbau3UMeLBBMNn)
13:04:32.004 Running "vercel build"
13:04:32.013 Vercel CLI 54.9.0
13:04:32.259 Installing dependencies...
13:04:35.280 
13:04:35.280 up to date in 3s
13:04:35.280 
13:04:35.280 5 packages are looking for funding
13:04:35.280   run `npm fund` for details
13:04:35.308 Detected Next.js version: 14.2.35
13:04:35.312 Running "npm run build"
13:04:35.400 
13:04:35.400 > anns-crane-crm@1.0.0 build
13:04:35.400 > next build
13:04:35.400 
13:04:35.935   ▲ Next.js 14.2.35
13:04:35.936 
13:04:35.960    Creating an optimized production build ...
13:04:45.666  ✓ Compiled successfully
13:04:45.666    Linting and checking validity of types ...
13:05:11.964 Failed to compile.
13:05:11.964 
13:05:11.964 ./app/api/jobs/[id]/documents/[documentId]/preview/route.ts:236:38
13:05:11.964 Type error: Argument of type 'SupabaseClient<any, "public", "public", any, any>' is not assignable to parameter of type 'SupabaseClient<unknown, { PostgrestVersion: string; }, never, never, { PostgrestVersion: string; }>'.
13:05:11.964   Type '"public"' is not assignable to type 'never'.
13:05:11.964 
13:05:11.964   234 |
13:05:11.964   235 |     const row = doc as JobDocumentRow;
13:05:11.964 > 236 |     const direct = await tryDownload(admin, storagePathCandidates(row, params.id));
13:05:11.964       |                                      ^
13:05:11.964   237 |     const resolved = direct ?? await findByFolderFuzzyMatch(admin, row, params.id);
13:05:11.964   238 |
13:05:11.964   239 |     if (resolved?.data) {
13:05:12.045 Next.js build worker exited with code: 1 and signal: null
13:05:12.066 Error: Command "npm run build" exited with 1
