// Позволяет импортировать ассеты с суффиксом ?url (обрабатывается vite) — например, воркер pdfjs.
declare module "*?url" {
  const src: string;
  export default src;
}
