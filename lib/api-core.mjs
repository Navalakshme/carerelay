export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new HttpError(400, 'Invalid record identifier.');
  return value;
}
export function text(value, max = 400, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new HttpError(400, `Enter between ${min} and ${max} characters.`);
  return value.trim();
}
export function validateMutation(req, origin) {
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Request origin rejected.');
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Send a JSON request.');
}
export async function readBody(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 8192) throw new HttpError(413, 'Request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (Buffer.byteLength(body) > 8192) throw new HttpError(413, 'Request is too large.');
    try { body = JSON.parse(body.toString()); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(400, 'Invalid request.');
  if (Buffer.byteLength(JSON.stringify(body)) > 8192) throw new HttpError(413, 'Request is too large.');
  return body;
}
export function rpcFor(body) {
  const circle = () => uuid(body.circle);
  switch (body.action) {
    case 'create-circle': return ['care_create_circle', { p_name: text(body.name, 80), p_display_name: text(body.displayName, 80), p_timezone: text(body.timezone, 80) }];
    case 'join': return ['care_join', { p_token: text(body.token, 64, 64), p_display_name: text(body.displayName, 80) }];
    case 'invite': {
      if (!['caregiver', 'viewer'].includes(body.role)) throw new HttpError(400, 'Choose caregiver or viewer.');
      return ['care_invite', { p_circle: circle(), p_role: body.role }];
    }
    case 'revoke-invitation': return ['care_revoke_invitation', { p_circle: circle(), p_invitation: uuid(body.invitation) }];
    case 'revoke-member': return ['care_revoke_member', { p_circle: circle(), p_member: uuid(body.member) }];
    case 'add-dose': {
      const scheduled = new Date(body.scheduled);
      if (typeof body.scheduled !== 'string' || !Number.isFinite(scheduled.getTime())) throw new HttpError(400, 'Choose a scheduled date and time.');
      return ['care_add_dose', { p_circle: circle(), p_label: text(body.label, 100), p_instructions: text(body.instructions ?? '', 400, 0), p_scheduled: scheduled.toISOString(), p_assigned: body.assigned ? uuid(body.assigned) : null }];
    }
    case 'report': {
      if (!['taken', 'skipped', 'uncertain'].includes(body.outcome)) throw new HttpError(400, 'Choose a valid dose outcome.');
      return ['care_report', { p_circle: circle(), p_dose: uuid(body.dose), p_outcome: body.outcome, p_request: uuid(body.requestId) }];
    }
    case 'claim': return ['care_claim', { p_circle: circle(), p_dose: uuid(body.dose) }];
    case 'question': return ['care_question', { p_circle: circle(), p_body: text(body.body, 400) }];
    case 'approve-brief': {
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new HttpError(400, 'Refresh the brief and try again.');
      return ['care_approve_brief', { p_circle: circle(), p_revision: body.revision }];
    }
    default: throw new HttpError(400, 'Unknown action.');
  }
}

export function databaseError(error) {
  if (error.code === '42501') return new HttpError(403, 'You do not have access to this circle or action.');
  if (error.code === '23505') return new HttpError(409, 'This record changed or already has an outcome. Refresh and review it.');
  if (error.code === 'P0001') return new HttpError(400, error.message);
  return new HttpError(500, 'Unable to save or load care records. Please try again.');
}
