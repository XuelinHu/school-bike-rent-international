import { parsePaging, paginateRows } from '../utils/paginate.js';

export function getMyOrderPage(executor, userId, query = {}) {
  const { page, pageSize } = parsePaging(query);
  return paginateRows(executor, {
    select: 'o.*',
    from: 'rental_orders o',
    where: ['o.user_id = ?'],
    params: [userId],
    orderBy: 'o.id DESC',
    page,
    pageSize
  });
}
