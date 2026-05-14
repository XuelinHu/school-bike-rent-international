import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import bikeRoutes from './routes/bikes.js';
import stationRoutes from './routes/stations.js';
import orderRoutes from './routes/orders.js';
import maintenanceRoutes from './routes/maintenance.js';
import announcementRoutes from './routes/announcements.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ code: 200, message: 'success', data: { status: 'ok' } }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bikes', bikeRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req, res) => res.status(404).json({ code: 404, message: `Not found: ${req.path}` }));
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ code: status, message: err.message || 'Internal server error' });
});

export default app;
