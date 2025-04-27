import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { default: safeLoop } = await import('./index.js'); // Импортируем твой SafeLoop

const app = express();
const PORT = process.env.PORT || 3000;

// Минимальный роут
app.get('/', (req, res) => {
  res.send('SafeLoop is running!');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});


