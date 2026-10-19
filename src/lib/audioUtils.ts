/**
 * Pakka Note - Audio Recording and WAV PCM Conversion Utilities
 * Handles microphone capture, 30s enforcement, track cleanup, and mono 16-bit 16kHz WAV encoding.
 */

export interface RecorderState {
  isRecording: boolean;
  elapsedSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

/**
 * Checks supported audio MIME types for MediaRecorder in the current browser
 */
export function getSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  const candidateTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
  ];

  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
}

/**
 * Derives appropriate file extension from a Blob or MIME string
 * NEVER returns 'wav' unless the MIME is actually WAV!
 */
export function getAudioFileExtension(mimeType: string): string {
  const clean = mimeType.toLowerCase();
  if (clean.includes('wav') || clean.includes('wave')) return 'wav';
  if (clean.includes('webm')) return 'webm';
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'm4a';
  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3';
  return 'bin';
}

/**
 * Verifies if a Blob has a valid RIFF WAVE header
 */
export async function isWavBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 44) return false;
  try {
    const slice = await blob.slice(0, 12).arrayBuffer();
    const view = new DataView(slice);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    return riff === 'RIFF' && wave === 'WAVE';
  } catch {
    return false;
  }
}

/**
 * Encodes an AudioBuffer into standard mono 16-bit PCM 16,000 Hz WAV Blob
 */
export function encodeWAV(audioBuffer: AudioBuffer): Blob {
  const targetSampleRate = 16000;
  const numChannels = 1;
  const sourceChannelData = audioBuffer.getChannelData(0);

  // Resample to 16,000 Hz if needed
  const sourceSampleRate = audioBuffer.sampleRate;
  const sampleRateRatio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.round(sourceChannelData.length / sampleRateRatio);
  const resampledData = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const originalIndex = Math.min(
      Math.round(i * sampleRateRatio),
      sourceChannelData.length - 1
    );
    resampledData[i] = sourceChannelData[originalIndex];
  }

  // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
  const byteRate = targetSampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = targetLength * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // Sub-chunk 1 "fmt "
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // Mono (1)
  view.setUint32(24, targetSampleRate, true); // Sample rate (16000)
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit depth

  // Sub-chunk 2 "data"
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM audio samples
  let offset = 44;
  for (let i = 0; i < targetLength; i++) {
    const s = Math.max(-1, Math.min(1, resampledData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Generates a clean synthetic PCM WAV audio file with modulated test tones
 * Suitable for testing audio pipelines without an external microphone
 */
export function generateSyntheticWavAudio(durationSeconds = 2.5, frequency = 440): Blob {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Amplitude modulation to simulate human speech envelope
    const envelope = Math.sin((Math.PI * i) / numSamples);
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5 * envelope;
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}
