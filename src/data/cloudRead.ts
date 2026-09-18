/** A stalled read is not an empty document, and must never enable autosave. */
export async function cloudRead<T>(request: Promise<T>, timeoutMs = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('云端读取超时，请检查网络后重新读取；未覆盖已有数据')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
