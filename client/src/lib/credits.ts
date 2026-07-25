let currentCredits = 0;

const simulateDelay = () => new Promise(resolve => setTimeout(resolve, 500));

export async function getCredits(): Promise<number> {
  await simulateDelay();
  return currentCredits;
}

export async function decrementCredits(): Promise<void> {
  await simulateDelay();
  if (currentCredits > 0) {
    currentCredits -= 1;
  }
}
