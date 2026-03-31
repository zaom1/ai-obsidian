import type { SttSettings } from "../types";

interface TranscriptionResponse {
  text?: string;
}

export class SttTranscriber {
  constructor(private readonly settings: SttSettings) {}

  isReady(): boolean {
    return (
      this.settings.enabled &&
      this.settings.baseUrl.trim().length > 0 &&
      this.settings.apiKey.trim().length > 0 &&
      this.settings.model.trim().length > 0
    );
  }

  async transcribeAudio(blob: Blob, filename = "speech.webm"): Promise<string> {
    if (!this.isReady()) {
      throw new Error("STT is not configured.");
    }

    const endpoint = `${this.settings.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
    const formData = new FormData();

    formData.append("file", blob, filename);
    formData.append("model", this.settings.model);

    if (this.settings.language) {
      formData.append("language", this.settings.language);
    }
    if (Number.isFinite(this.settings.temperature)) {
      formData.append("temperature", String(this.settings.temperature));
    }
    if (this.settings.prompt) {
      formData.append("prompt", this.settings.prompt);
    }

    const controller = new AbortController();
    const timeoutMs = Math.max(5000, this.settings.timeoutMs);
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const payload = (await response.json()) as TranscriptionResponse;
      const text = payload.text?.trim();
      if (!text) {
        throw new Error("Transcription result is empty.");
      }
      return text;
    } finally {
      window.clearTimeout(timer);
    }
  }
}
