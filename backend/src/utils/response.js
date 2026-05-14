export function ok(res, data = null, message = 'success') {
  return res.json({ code: 200, message, data });
}

export function fail(res, status = 400, message = 'error') {
  return res.status(status).json({ code: status, message });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
