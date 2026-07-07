// Заглушка @napi-rs/canvas: реальный пакет нужен pdfjs только в Node.js.
// В браузерной сборке этот модуль не выполняется (pdfjs берёт DOM canvas).
module.exports = {};
