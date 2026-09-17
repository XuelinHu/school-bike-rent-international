import app from './app.js';

const port = Number(process.env.PORT || 8032);
app.listen(port, () => {
  console.log(`Student bike rental API running at http://localhost:${port}`);
});
