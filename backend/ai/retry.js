const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withAiRetry(task, { maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  let attempt = 1;
  let lastError;

  while (attempt <= maxAttempts) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      console.warn(
        `AI attempt ${attempt}/${maxAttempts} failed:`,
        error.message || error,
      );

      if (attempt >= maxAttempts) {
        break;
      }

      const delaySeconds = Math.random() * Math.min(60, 2 ** attempt);
      console.log(
        `AI retrying in ${delaySeconds.toFixed(2)}s (attempt ${attempt + 1}/${maxAttempts})...`,
      );
      await sleep(delaySeconds * 1000);
      attempt += 1;
    }
  }

  throw lastError;
}
