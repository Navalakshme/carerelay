export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Same-origin JSON transport. Authentication state remains owned by the controller. */
export function createApiClient({
  fetchImpl = fetch,
  onUnauthorized = () => {},
  timeout = 20000,
} = {}) {
  return async function api(body, circle, options = {}) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout);
    const url =
      '/api/care' + (circle ? '?circle=' + encodeURIComponent(circle) + (options.query || '') : '');
    const response = await fetchImpl(url, {
      signal,
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError('The service did not respond. Try again.', response.status);
    }
    if (!response.ok) {
      if (response.status === 401 && !signal.aborted) onUnauthorized();
      throw new ApiError(result.error || 'Unable to complete that action.', response.status);
    }
    return result;
  };
}
