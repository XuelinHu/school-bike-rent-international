import app from './app.js';

const port = Number(process.env.PORT || 8032);
const host = process.env.API_HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Student bike rental API running at http://${host}:${port}`);
});
