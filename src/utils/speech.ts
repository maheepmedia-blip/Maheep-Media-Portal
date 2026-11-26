export function detectSpeechLang(text: string, hint?: 'en' | 'hi'): 'hi-IN' | 'en-IN' {
  if (hint === 'hi' || /[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }
  return 'en-IN';
}

export function stopNewspaperSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

export function speakNewspaperText(
  text: string,
  options?: { lang?: 'en' | 'hi'; onStart?: () => void; onEnd?: () => void; onError?: () => void },
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean.slice(0, 4500));
  utterance.lang = detectSpeechLang(clean, options?.lang);
  utterance.rate = 0.98;
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => {
    options?.onError?.();
    options?.onEnd?.();
  };
  options?.onStart?.();
  window.speechSynthesis.speak(utterance);
  return true;
}
