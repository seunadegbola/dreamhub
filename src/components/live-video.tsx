"use client";

/**
 * LiveKit implementation of the Focus Room's video (PRD §8, §18).
 * Everyone's goal and check-in update travel as LiveKit participant attributes,
 * so the table roster needs no extra database calls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useChat, useLocalParticipant, useParticipants, useTracks, useConnectionState } from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import { isTrackReference, type TrackReference } from "@livekit/components-core";
import { Avatar, Button, inputClass } from "./ui";
import { IconClose, IconMicOff } from "./icons";
import { Modal } from "./modal";

export interface RosterPerson {
  id: string; // LiveKit identity = DreamHub user id
  name: string;
  hue: number;
  goal: string;
  update?: string;
  isLocal: boolean;
}

export function VideoSession({
  token,
  url,
  children,
  onDisconnected,
}: {
  token: string;
  url: string;
  children: React.ReactNode;
  onDisconnected?: () => void;
}) {
  return (
    <LiveKitRoom token={token} serverUrl={url} connect audio={false} video={false} onDisconnected={onDisconnected} options={{ adaptiveStream: true, dynacast: true }}>
      <RoomAudioRenderer />
      {children}
    </LiveKitRoom>
  );
}

/** Keeps camera, microphone and attributes in step with the room's UI state. */
export function LocalControls({ cam, mic, goal, update }: { cam: boolean; mic: boolean; goal: string; update?: string }) {
  const { localParticipant } = useLocalParticipant();
  const state = useConnectionState();
  const connected = state === ConnectionState.Connected;

  useEffect(() => {
    if (connected) localParticipant.setCameraEnabled(cam).catch(() => undefined);
  }, [cam, connected, localParticipant]);
  useEffect(() => {
    if (connected) localParticipant.setMicrophoneEnabled(mic).catch(() => undefined);
  }, [mic, connected, localParticipant]);
  useEffect(() => {
    if (connected) localParticipant.setAttributes({ goal: goal.slice(0, 120), update: (update ?? "").slice(0, 80) }).catch(() => undefined);
  }, [goal, update, connected, localParticipant]);
  return null;
}

export function ConnectionBanner() {
  const state = useConnectionState();
  if (state === ConnectionState.Connected) return null;
  const text =
    state === ConnectionState.Connecting
      ? "Connecting to the table…"
      : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting
        ? "Oops — we lost connection. 😅 Reconnecting you…"
        : "Video is disconnected. Your timer and progress are still running.";
  return <p className="rounded-[8px] border-2 border-ink bg-save-tint px-3 py-2 text-sm font-semibold" role="status">{text}</p>;
}

function hueOf(p: Participant) {
  try {
    return JSON.parse(p.metadata ?? "{}").hue ?? 225;
  } catch {
    return 225;
  }
}

/** Reports the roster up to the room page (for the "Different goals" panel). */
export function useRoster(): RosterPerson[] {
  const participants = useParticipants();
  return useMemo(
    () =>
      participants.map((p) => ({
        id: p.identity,
        name: p.name || "Someone",
        hue: hueOf(p),
        goal: p.attributes?.goal || "Focusing",
        update: p.attributes?.update || undefined,
        isLocal: p.isLocal,
      })),
    [participants],
  );
}

export function RosterReporter({ onChange }: { onChange: (r: RosterPerson[]) => void }) {
  const roster = useRoster();
  const key = roster.map((r) => `${r.id}|${r.name}|${r.goal}|${r.update ?? ""}`).join(",");
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    cb.current(roster);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function VideoGrid({
  showUpdates,
  quiet,
  hidden,
  isHost,
  onReport,
  onBlock,
  onRemove,
}: {
  showUpdates: boolean;
  quiet: boolean;
  hidden: string[];
  isHost: boolean;
  onReport: (p: RosterPerson) => void;
  onBlock: (p: RosterPerson) => void;
  onRemove: (p: RosterPerson) => void;
}) {
  const participants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const roster = useRoster();
  const ordered = [...participants].sort((a, b) => (a.isLocal ? -1 : b.isLocal ? 1 : (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0)));

  return (
    <ul className={clsx("grid gap-3", ordered.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
      {ordered.map((p) => {
        const person = roster.find((r) => r.id === p.identity)!;
        if (!person) return null;
        const track: TrackReference | undefined =
          !quiet && !hidden.includes(p.identity)
            ? cameraTracks.filter(isTrackReference).find((t) => t.participant.identity === p.identity && !t.publication.isMuted)
            : undefined;
        const micOn = p.isMicrophoneEnabled;
        return (
          <li
            key={p.identity}
            className={clsx("relative aspect-[4/3] overflow-hidden rounded-[var(--dh-radius)] border-2 border-ink sm:aspect-video", p.isLocal && "shadow-brut-sm", p.isSpeaking && micOn && "ring-4 ring-sky")}
            style={{ background: `hsl(${person.hue} 60% 88%)` }}
          >
            {track ? (
              <VideoTrack trackRef={track} className={clsx("h-full w-full object-cover", p.isLocal && "scale-x-[-1]")} />
            ) : (
              <div className="grid h-full place-items-center pb-8">
                <Avatar name={person.name} hue={person.hue} size={48} />
              </div>
            )}
            {showUpdates && person.update && (
              <span className="rise absolute inset-x-2 top-2 rounded-[8px] border-2 border-ink bg-surface px-2 py-1 text-xs font-semibold">{person.update}</span>
            )}
            {!p.isLocal && <TileMenu person={person} isHost={isHost} hiddenVideo={hidden.includes(p.identity)} onReport={onReport} onBlock={onBlock} onRemove={onRemove} />}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/85 to-transparent p-2.5 pt-6 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {person.name}
                  {p.isLocal ? " (you)" : ""}
                </p>
                <p className="truncate text-xs text-white/80">{person.goal}</p>
              </div>
              {!micOn && <IconMicOff width={16} height={16} className="shrink-0 opacity-80" />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TileMenu({
  person,
  isHost,
  hiddenVideo,
  onReport,
  onBlock,
  onRemove,
}: {
  person: RosterPerson;
  isHost: boolean;
  hiddenVideo: boolean;
  onReport: (p: RosterPerson) => void;
  onBlock: (p: RosterPerson) => void;
  onRemove: (p: RosterPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute right-2 top-2">
      <button
        aria-label={`Options for ${person.name}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-full border-2 border-ink bg-surface text-lg font-bold leading-none"
      >
        ⋯
      </button>
      {open && (
        <div className="rise absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-[10px] border-2 border-ink bg-surface text-sm shadow-brut" role="menu">
          <MenuItem
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("dh-hide-video", { detail: person.id }));
            }}
          >
            {hiddenVideo ? "Show their video" : "Hide their video"}
          </MenuItem>
          {isHost && (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onRemove(person);
              }}
            >
              Remove from session
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setOpen(false);
              onReport(person);
            }}
          >
            Report
          </MenuItem>
          <MenuItem
            danger
            onClick={() => {
              setOpen(false);
              onBlock(person);
            }}
          >
            Block
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={clsx("block w-full px-3 py-2 text-left font-semibold hover:bg-haze/50", danger && "text-missed")}>
      {children}
    </button>
  );
}

export function LiveChat({ onClose }: { onClose: () => void }) {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chatMessages.length]);
  return (
    <aside className="rise fixed bottom-24 right-4 z-30 flex h-[420px] w-[min(360px,calc(100vw-2rem))] flex-col rounded-[14px] border-2 border-ink bg-surface shadow-brut" aria-label="Chat">
      <div className="flex items-center justify-between border-b-2 border-ink/10 px-4 py-3">
        <p className="font-semibold">Table chat</p>
        <button onClick={onClose} aria-label="Close chat">
          <IconClose width={20} height={20} />
        </button>
      </div>
      <ul ref={list} className="flex-1 space-y-3 overflow-y-auto p-4">
        {chatMessages.length === 0 && <li className="text-sm text-muted">Say hi at the break. Links are turned off for new accounts.</li>}
        {chatMessages.map((m) => {
          const mine = m.from?.isLocal;
          return (
            <li key={m.id} className={clsx("max-w-[85%] rounded-[10px] px-3 py-2 text-[15px]", mine ? "ml-auto bg-blue text-white" : "bg-paper")}>
              <p className="text-xs font-semibold opacity-75">{m.from?.name ?? "Someone"}</p>
              {m.message}
            </li>
          );
        })}
      </ul>
      <form
        className="flex gap-2 border-t-2 border-ink/10 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const clean = text.trim().slice(0, 300);
          if (!clean) return;
          await send(clean);
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something kind" className={clsx(inputClass, "h-10")} maxLength={300} />
        <Button size="sm" type="submit" className="h-10" disabled={isSending}>
          Send
        </Button>
      </form>
    </aside>
  );
}

const REASONS = [
  ["inappropriate", "Inappropriate behaviour"],
  ["harassment", "Harassment"],
  ["spam", "Spam or selling"],
  ["content", "Inappropriate content"],
  ["recording", "Recording others"],
  ["other", "Something else"],
] as const;

export function ReportModal({ person, onClose, onSubmit }: { person: RosterPerson | null; onClose: () => void; onSubmit: (reason: string, details: string, alsoBlock: boolean) => void }) {
  const [reason, setReason] = useState<string>("inappropriate");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  return (
    <Modal open={!!person} onClose={onClose} title={`Report ${person?.name ?? ""}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason, details.trim(), block);
          setDetails("");
        }}
      >
        <div className="grid gap-2">
          {REASONS.map(([value, label]) => (
            <label key={value} className={clsx("flex cursor-pointer items-center gap-3 rounded-[10px] border-2 px-3 py-2 font-semibold", reason === value ? "border-ink bg-haze/40" : "border-hairline")}>
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="accent-[var(--dh-blue)]" />
              {label}
            </label>
          ))}
        </div>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything else we should know? (optional)" className={clsx(inputClass, "h-24 py-2")} maxLength={1000} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={block} onChange={() => setBlock((b) => !b)} className="accent-[var(--dh-blue)]" />
          Also block them, so you’re never seated together
        </label>
        <Button type="submit">Send report</Button>
      </form>
    </Modal>
  );
}
