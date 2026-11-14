// GET  /api/schedule-import — import history, freshness status, saved column mappings.
// POST /api/schedule-import — upload an eCW appointment report (multipart field "file", .csv/.xlsx, ≤ 5 MB).
//      Parses it server-side and returns a DRAFT with a dry-run preview. Nothing changes until Apply.
import { withAuth, jsonError } from '@/server/auth/guard';
import { getImportOverview, ImportError, ImportFileError, MAX_FILE_BYTES, uploadSchedule } from '@/server/import';

export const GET = withAuth(async () => Response.json(await getImportOverview()));

export const POST = withAuth(async (req, _ctx, user) => {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) return jsonError(413, 'The file is larger than 5 MB.');
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) return jsonError(400, 'Upload the file as multipart/form-data.');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, 'Could not read the upload.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonError(400, 'Choose a .csv or .xlsx file.');
  if (file.size > MAX_FILE_BYTES) return jsonError(413, 'The file is larger than 5 MB.');
  if (file.size === 0) return jsonError(400, 'The file is empty.');

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    return Response.json(await uploadSchedule(user, { name: file.name || 'upload.csv', bytes }));
  } catch (err) {
    if (err instanceof ImportFileError) return jsonError(400, err.message);
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
