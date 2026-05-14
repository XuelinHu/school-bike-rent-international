import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/errors.js';

export function auth(required = true) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      if (!required) return next();
      return next(new HttpError(401, 'Unauthorized'));
    }
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid token'));
    }
  };
}
