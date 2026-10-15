export const normalizeYjsUpdate = (update) => {
  if (update instanceof Uint8Array) return update;
  if (update instanceof ArrayBuffer) return new Uint8Array(update);
  if (ArrayBuffer.isView(update)) {
    return new Uint8Array(update.buffer, update.byteOffset, update.byteLength);
  }
  if (update?.type === "Buffer" && Array.isArray(update.data)) {
    return Uint8Array.from(update.data);
  }
  return null;
};

export const replaceSharedText = (sharedDoc, field, nextText) => {
  const sharedText = sharedDoc.getText(field);
  const currentText = sharedText.toString();
  let prefixLength = 0;

  while (
    prefixLength < currentText.length &&
    prefixLength < nextText.length &&
    currentText[prefixLength] === nextText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < currentText.length - prefixLength &&
    suffixLength < nextText.length - prefixLength &&
    currentText[currentText.length - suffixLength - 1] ===
      nextText[nextText.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const removedLength = currentText.length - prefixLength - suffixLength;
  const insertedText = nextText.slice(prefixLength, nextText.length - suffixLength);

  if (removedLength === 0 && insertedText.length === 0) return;

  sharedDoc.transact(() => {
    if (removedLength > 0) sharedText.delete(prefixLength, removedLength);
    if (insertedText) sharedText.insert(prefixLength, insertedText);
  });
};