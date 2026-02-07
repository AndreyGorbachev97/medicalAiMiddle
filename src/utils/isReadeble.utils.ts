export const isReadable = (text: string): boolean => {
  const cleaned = text.replace(/[\x00-\x1F]/g, ''); // убрать управляющие символы
  const ratio = cleaned.length / text.length;
  return ratio > 0.8 && /[a-zA-Zа-яА-Я]/.test(cleaned); // >80% и есть буквы
};
