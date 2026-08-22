import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

/** Mic input: dictate into the composer via the browser's speech recognition. */
export function useSpeechInput(onResult: (text: string) => void, onEnd?: () => void) {
  const [supported, setSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalTextRef = useRef("");

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  function start(currentText: string) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    baseTextRef.current = currentText ? `${currentText} ` : "";
    finalTextRef.current = "";

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalTextRef.current += `${transcript} `;
        else interim += transcript;
      }
      onResult(baseTextRef.current + finalTextRef.current + interim);
    };
    recognition.onend = () => {
      setIsListening(false);
      onEnd?.();
    };
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  return { supported, isListening, start, stop };
}

/**
 * Ranks available system voices and picks the most natural-sounding one.
 * Browsers (Edge and Chrome on Windows especially) often ship both the old
 * robotic SAPI voices and much better cloud-backed "Natural"/neural ones —
 * the platform just doesn't default to the good one.
 */
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const lang = navigator.language;
  const baseLang = lang.split("-")[0];

  function score(voice: SpeechSynthesisVoice): number {
    let s = 0;
    if (voice.lang === lang) s += 3;
    else if (voice.lang.split("-")[0] === baseLang) s += 2;
    if (/natural|neural|premium|enhanced/i.test(voice.name)) s += 6;
    if (/online/i.test(voice.name)) s += 2;
    if (!voice.localService) s += 1;
    return s;
  }

  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/** Reads Kapehu's replies aloud via the browser's speech synthesis. */
export function useSpeechOutput() {
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!supported) return;

    function loadVoices() {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [supported]);

  function speak(text: string) {
    if (!supported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const bestVoice = pickBestVoice(voicesRef.current);
    if (bestVoice) utterance.voice = bestVoice;
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  return { supported, isSpeaking, speak, stop };
}
