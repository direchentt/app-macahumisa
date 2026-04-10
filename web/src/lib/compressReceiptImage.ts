/** Comprime a JPEG para caber en JSON; límite ~700KB base64. */
export async function compressReceiptToDataUrl(file: File, maxW = 1280, quality = 0.82): Promise<string> {
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
    throw new Error("Formato no soportado. Usá JPEG, PNG o WebP.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("La imagen supera 12 MB. Elegí otra más chica.");
  }
  const bmp = await createImageBitmap(file);
  const scale = bmp.width > maxW ? maxW / bmp.width : 1;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (dataUrl.length > 700_000) {
    throw new Error("La imagen sigue siendo muy grande. Probá otra foto o recortala.");
  }
  return dataUrl;
}
