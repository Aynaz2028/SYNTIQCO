import { fetchTranscript } from "youtube-transcript";

const MAX_TRANSCRIPT_CHARS = 12000;

/** Pulls a video id out of any common YouTube URL shape, or a bare 11-char id. */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const shorts = url.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/^\/embed\/([^/?]+)/);
      if (embed) return embed[1];
      const live = url.pathname.match(/^\/live\/([^/?]+)/);
      if (live) return live[1];
    }
    return null;
  } catch {
    // Not a parseable URL — accept a bare video id pasted directly.
    return /^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
  }
}

export interface VideoMeta {
  title: string;
  author: string | null;
  thumbnailUrl: string;
}

/** Public, unauthenticated oEmbed lookup — no API key required. */
export async function getVideoMeta(videoId: string): Promise<VideoMeta> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
  );
  if (!res.ok) {
    throw new Error("Couldn't find that video — check the link and try again.");
  }
  const data = (await res.json()) as { title?: string; author_name?: string };
  return {
    title: data.title ?? "YouTube video",
    author: data.author_name ?? null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/** Fetches the video's transcript and flattens it to plain text, capped for prompt size. */
export async function getVideoTranscriptText(videoId: string): Promise<string> {
  let segments;
  try {
    segments = await fetchTranscript(videoId);
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (message.toLowerCase().includes("disabled")) {
      throw new Error("Captions are disabled on this video, so it can't be summarized.");
    }
    if (message.toLowerCase().includes("too many request")) {
      throw new Error("Too many requests right now — try again in a minute.");
    }
    if (message.toLowerCase().includes("unavailable")) {
      throw new Error("That video is unavailable — check the link and try again.");
    }
    throw new Error("Couldn't fetch a transcript for that video.");
  }

  if (!segments || segments.length === 0) {
    throw new Error("No transcript is available for that video.");
  }

  const fullText = segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return fullText.length > MAX_TRANSCRIPT_CHARS
    ? fullText.slice(0, MAX_TRANSCRIPT_CHARS)
    : fullText;
}
