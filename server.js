const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Подключаем твой SafeLoop
require('./index'); 

// Простейший роут
app.get('/', (req, res) => {
  res.send('SafeLoop is running!');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
