import { HttpError } from '../utils/errors.js';

export function allow(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Forbidden'));
    }
    return next();
  };
}
