import { Modal, Notice, Setting } from "obsidian";
import type SmartCapturePlugin from "../main";

export class CaptureModal extends Modal {
  private inputValue = "";
  private textAreaEl: HTMLTextAreaElement | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private statusEl: HTMLElement | null = null;

  constructor(private readonly plugin: SmartCapturePlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Smart Capture" });
    contentEl.createEl("p", {
      text: "Input text directly or record voice. Voice uses your STT settings and appends text here.",
      cls: "sch-input-hint"
    });

    new Setting(contentEl)
      .setName("Input")
      .setDesc("Examples: 'lunch 32 cny', 'todo call Alice tomorrow', 'subscription YouTube 88 yearly'")
      .addTextArea((text) => {
        text.inputEl.rows = 7;
        text.inputEl.style.width = "100%";
        this.textAreaEl = text.inputEl;
        text.onChange((value) => {
          this.inputValue = value;
        });
      });

    const controls = contentEl.createDiv();
    controls.style.display = "flex";
    controls.style.gap = "8px";
    controls.style.marginTop = "8px";

    const startButton = controls.createEl("button", { text: "Start Recording" });
    startButton.addEventListener("click", async () => {
      await this.startRecording();
    });

    const stopButton = controls.createEl("button", { text: "Stop + Transcribe" });
    stopButton.addEventListener("click", async () => {
      await this.stopRecordingAndTranscribe();
    });

    const submitButton = controls.createEl("button", { text: "Capture" });
    submitButton.addEventListener("click", async () => {
      await this.handleSubmit();
    });

    this.statusEl = contentEl.createEl("div", { cls: "sch-result", text: "Idle" });
  }

  onClose(): void {
    this.cleanupRecordingResources();
    this.contentEl.empty();
  }

  private async startRecording(): Promise<void> {
    if (this.recorder && this.recorder.state === "recording") {
      new Notice("Recording already in progress.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      new Notice("MediaRecorder is not supported in this environment.");
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream);

      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.recorder.start();
      this.setStatus("Recording...");
      new Notice("Recording started.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      this.cleanupRecordingResources();
    }
  }

  private async stopRecordingAndTranscribe(): Promise<void> {
    if (!this.recorder || this.recorder.state !== "recording") {
      new Notice("No active recording.");
      return;
    }

    this.setStatus("Processing audio...");
    const recorder = this.recorder;

    const recordedBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type: mimeType }));
      };
      recorder.onerror = () => reject(new Error("Recording failed."));
      recorder.stop();
    });

    this.cleanupRecordingResources();

    if (recordedBlob.size === 0) {
      new Notice("Empty recording. Please try again.");
      this.setStatus("Idle");
      return;
    }

    try {
      const text = await this.plugin.transcribeAudio(recordedBlob);
      this.appendText(text);
      this.setStatus("Transcription complete.");
      new Notice("Transcription appended.");
    } catch (error) {
      this.setStatus("Transcription failed.");
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private appendText(value: string): void {
    const next = this.inputValue ? `${this.inputValue}\n${value}` : value;
    this.inputValue = next;
    if (this.textAreaEl) {
      this.textAreaEl.value = next;
      this.textAreaEl.dispatchEvent(new Event("input"));
    }
  }

  private cleanupRecordingResources(): void {
    if (this.recorder && this.recorder.state === "recording") {
      this.recorder.stop();
    }
    this.recorder = null;

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    this.chunks = [];
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  private async handleSubmit(): Promise<void> {
    const text = this.inputValue.trim();
    if (!text) {
      new Notice("Please enter some text.");
      return;
    }

    const result = await this.plugin.captureInput(text);
    new Notice(result);
    this.close();
  }
}
