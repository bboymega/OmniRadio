"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  Loader2,
  Play,
  Square,
  X,
  Settings,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

import { MediaSession } from "@capgo/capacitor-media-session";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";

type StreamSource = {
  id: string;
  name: string;
  description?: string;
  url: string;
  builtIn?: boolean;
};

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fsSourceRef = useRef<HTMLDivElement | null>(null);

  const sidebarSourceRef =
    useRef<HTMLDivElement | null>(null);

  const externalPauseRef = useRef(false);

  const userPausedRef = useRef(false);

  const streamFailedRef = useRef(false);

  const SOURCES_STORAGE_KEY =
    "radio-stream-sources";

  const SELECTED_SOURCE_STORAGE_KEY =
    "selected-stream-source";

  // 0 = paused
  // 1 = buffering/recovering
  // 2 = playing
  const [playing, setPlaying] = useState(0);

  const [fsSourceOpen, setFsSourceOpen] =
    useState(false);

  const [controlsOpen, setControlsOpen] =
    useState(false);

  const [sourceMenuOpen, setSourceMenuOpen] =
    useState(false);

  const [manageSourcesOpen, setManageSourcesOpen] =
    useState(false);

  const [newSourceName, setNewSourceName] =
    useState("");

  const [newSourceUrl, setNewSourceUrl] =
    useState("");

  const [
    newSourceDescription,
    setNewSourceDescription,
  ] = useState("");

  const defaultSources: StreamSource[] = [];

  const [sources, setSources] = useState<
    StreamSource[]
  >(defaultSources);

  const [selectedSource, setSelectedSource] =
    useState<StreamSource | null>(null);

  const [sourceError, setSourceError] =
  useState("");

  const [stealthMode, setStealthMode] =
  useState(false);

  const [deleteTarget, setDeleteTarget] =
  useState<StreamSource | null>(null);

  const [editingSource, setEditingSource] =
  useState<StreamSource | null>(null);

  const [editModalOpen, setEditModalOpen] =
    useState(false);

  const [discardEditOpen, setDiscardEditOpen] =
    useState(false);

  const [addModalOpen, setAddModalOpen] =
  useState(false);

  const [discardAddOpen, setDiscardAddOpen] =
    useState(false);

  const [editDraft, setEditDraft] = useState({
    name: "",
    url: "",
    description: "",
  });

  const hasEditChanges =
  editingSource &&
  (
    editDraft.name !== editingSource.name ||
    editDraft.url !== editingSource.url ||
    editDraft.description !==
      (
        editingSource.description ===
        editingSource.url
          ? ""
          : editingSource.description || ""
      )
  );

  const hasAddChanges =
  newSourceName.trim() !== "" ||
  newSourceUrl.trim() !== "" ||
  newSourceDescription.trim() !== "";

  useEffect(() => {
    const loadSources = async () => {
      try {
        const savedSources = await Preferences.get({
          key: SOURCES_STORAGE_KEY,
        });

        let parsedSources = defaultSources;

        if (savedSources.value) {
          parsedSources = JSON.parse(
            savedSources.value,
          );
        }

        setSources(parsedSources);

        const selected = await Preferences.get({
          key: SELECTED_SOURCE_STORAGE_KEY,
        });

        if (selected.value) {
          const found = parsedSources.find(
            (s) => s.id === selected.value,
          );

          if (found) {
            setSelectedSource(found);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    void loadSources();

    void Preferences.get({
      key: "stealth-mode",
    }).then((res) => {
      if (res.value === "true") {
        setStealthMode(true);
      }
    });

  }, []);

  const streamUrl = selectedSource
  ? stealthMode
    ? `http://127.0.0.87:8787/proxy?url=${encodeURIComponent(
        selectedSource.url,
      )}`
    : selectedSource.url
  : "";

  const streamUrlRef = useRef(streamUrl);

  useEffect(() => {
    streamUrlRef.current = streamUrl;
  }, [streamUrl]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !selectedSource) {
      return;
    }

    const wasPlaying = playingRef.current === 2;

    // fully reset old connection
    manualStopRef.current = true;

    stopHealthCheck();

    hardResetAudio();

    manualStopRef.current = false;

    // if previously playing, reconnect using new URL
    if (wasPlaying) {
      void (async () => {
        try {
          setPlaying(1);

          audio.src = streamUrl;

          audio.load();

          await audio.play();

          await MediaSession.setPlaybackState({
            playbackState: "playing",
          });

          retryCountRef.current = 0;

          recoveringRef.current = false;

          setPlaying(2);

          startHealthCheck(2500);

        } catch (err) {
          console.error(
            "Failed to remount stream after stealth toggle",
            err,
          );

          setPlaying(0);

          await MediaSession.setPlaybackState({
            playbackState: "paused",
          });
        }
      })();
    }
  }, [stealthMode]);

  const retryCountRef = useRef(0);

  const healthIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null,
    );

  const recoveringRef = useRef(false);

  const manualStopRef = useRef(false);

  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopHealthCheck = () => {
    if (healthIntervalRef.current !== null) {
      clearInterval(healthIntervalRef.current);

      healthIntervalRef.current = null;
    }

    retryCountRef.current = 0;

    recoveringRef.current = false;
  };

  const startHealthCheck = (interval = 2500) => {
    if (healthIntervalRef.current !== null) {
      clearInterval(healthIntervalRef.current);
    }

    healthIntervalRef.current = setInterval(() => {
      void healthCheck();
    }, interval);
  };

  const hardResetAudio = () => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.pause();

    audio.src = "";

    audio.removeAttribute("src");

    audio.load();
  };

  const reconnectStream = async () => {
    const audio = audioRef.current;

    if (!audio) return;

    if (
      externalPauseRef.current ||
      userPausedRef.current
    ) {
      return;
    }

    try {
      hardResetAudio();

      audio.src = streamUrlRef.current;

      audio.load();

      await audio.play();

      await MediaSession.setPlaybackState({
        playbackState: "playing",
      });

      recoveringRef.current = false;

      retryCountRef.current = 0;

      setPlaying(2);

      startHealthCheck(2500);
    } catch (err) {
      console.error("Reconnect failed", err);
    }
  };

  const healthCheck = async () => {
    const audio = audioRef.current;

    if (!audio) return;

    if (
      externalPauseRef.current ||
      userPausedRef.current
    ) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 2000);

    try {
      const currentUrl = streamUrlRef.current;

      const res = await fetch(currentUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error("Stream unavailable");
      }

      retryCountRef.current = 0;

      if (recoveringRef.current) {
        await reconnectStream();
      }
    } catch {
      clearTimeout(timeoutId);

      retryCountRef.current += 1;

      if (
        retryCountRef.current > 1 &&
        !recoveringRef.current
      ) {
        recoveringRef.current = true;

        setPlaying(1);

        manualStopRef.current = true;

        hardResetAudio();

        manualStopRef.current = false;

        startHealthCheck(2000);
      }

      if (retryCountRef.current >= 15) {
        stopHealthCheck();

        manualStopRef.current = true;

        hardResetAudio();

        manualStopRef.current = false;

        setPlaying(0);

        await MediaSession.setPlaybackState({
          playbackState: "paused",
        });
      }
    }
  };

  const playingRef = useRef(playing);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const syncPlayingState = async () => {
      if (!audio.paused && !audio.ended) {
        externalPauseRef.current = false;

        setPlaying(2);

        await MediaSession.setPlaybackState({
          playbackState: "playing",
        });

        startHealthCheck(2500);
      } else {
        setPlaying(0);

        await MediaSession.setPlaybackState({
          playbackState: "paused",
        });
      }
    };

    const handleAudioPlaying = async () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);

        pauseTimeoutRef.current = null;
      }

      // wait until stream is actually ready
      if (audio.readyState < 3) {
        return;
      }

      externalPauseRef.current = false;

      setPlaying(2);

      await MediaSession.setPlaybackState({
        playbackState: "playing",
      });

      startHealthCheck(2500);
    };

    const handleAudioPause = async () => {
      if (
        manualStopRef.current ||
        recoveringRef.current ||
        userPausedRef.current
      ) {
        return;
      }

      // transient interruption protection
      pauseTimeoutRef.current = setTimeout(async () => {
        if (audio.paused) {
          externalPauseRef.current = true;

          stopHealthCheck();

          setPlaying(0);

          await MediaSession.setPlaybackState({
            playbackState: "paused",
          });
        }
      }, 1500);
    };

    const handleAudioError = async () => {
      if (
        recoveringRef.current ||
        userPausedRef.current ||
        externalPauseRef.current
      ) {
        return;
      }

      streamFailedRef.current = true;

      recoveringRef.current = true;

      setPlaying(1);

      startHealthCheck(2000);
    };

    const handleEnded = async () => {
      setPlaying(0);

      await MediaSession.setPlaybackState({
        playbackState: "paused",
      });
    };

    audio.addEventListener("pause", handleAudioPause);

    audio.addEventListener(
      "playing",
      handleAudioPlaying,
    );

    audio.addEventListener("ended", handleEnded);

    audio.addEventListener("error", handleAudioError);

    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }

      audio.removeEventListener(
        "pause",
        handleAudioPause,
      );

      audio.removeEventListener(
        "playing",
        handleAudioPlaying,
      );

      audio.removeEventListener(
        "ended",
        handleEnded,
      );

      audio.removeEventListener(
        "error",
        handleAudioError,
      );

      stopHealthCheck();
    };
  }, []);

  useEffect(() => {
    const setupBackButton = async () => {
      const listener = await App.addListener(
        "backButton",
        ({ canGoBack }) => {

          if (discardAddOpen) {
            setDiscardAddOpen(false);
            return;
          }

          if (addModalOpen) {
            attemptCloseAddModal();
            return;
          }

          if (discardEditOpen) {
            setDiscardEditOpen(false);
            return;
          }

          if (editModalOpen) {
            attemptCloseEditModal();
            return;
          }

          if (deleteTarget) {
            setDeleteTarget(null);
            return;
          }

          if (manageSourcesOpen) {
            setManageSourcesOpen(false);
            return;
          }

          if (fsSourceOpen) {
            setFsSourceOpen(false);
            return;
          }

          if (sourceMenuOpen) {
            setSourceMenuOpen(false);
            return;
          }

          if (controlsOpen) {
            setControlsOpen(false);
            return;
          }

          if (canGoBack) {
            window.history.back();
          } else {
            App.minimizeApp();
          }
        },
      );

      return listener;
    };

    let cleanup:
      | {
          remove: () => Promise<void>;
        }
      | undefined;

    void setupBackButton().then((l) => {
      cleanup = l;
    });

    return () => {
      void cleanup?.remove();
    };
  }, [
    fsSourceOpen,
    sourceMenuOpen,
    controlsOpen,
    manageSourcesOpen,
    deleteTarget,

    discardAddOpen,
    addModalOpen,

    discardEditOpen,
    editModalOpen,

    hasAddChanges,
    hasEditChanges,
  ]);

  useEffect(() => {
    if (controlsOpen || manageSourcesOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [controlsOpen, manageSourcesOpen]);

  useEffect(() => {
    if (!fsSourceOpen) return;

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      const target = event.target as Node;

      if (
        fsSourceRef.current &&
        !fsSourceRef.current.contains(target)
      ) {
        setFsSourceOpen(false);
      }
    };

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      {
        passive: true,
      },
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
    };
  }, [fsSourceOpen]);

  useEffect(() => {
    if (!sourceMenuOpen) return;

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      const target = event.target as Node;

      if (
        sidebarSourceRef.current &&
        !sidebarSourceRef.current.contains(target)
      ) {
        setSourceMenuOpen(false);
      }
    };

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      {
        passive: true,
      },
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
    };
  }, [sourceMenuOpen]);

  useEffect(() => {
    const setupMediaSession = async () => {
      await MediaSession.setMetadata({
        title:
          selectedSource?.name ||
          "No source selected",

        artist: selectedSource?.description || selectedSource?.url,

        album:
          selectedSource?.url || "OmniRadio"
      });

      await MediaSession.setActionHandler(
        { action: "play" },
        async () => {
          const audio = audioRef.current;

          if (!audio || !audio.paused) return;

          userPausedRef.current = false;

          externalPauseRef.current = false;

          streamFailedRef.current = false;

          try {
            setPlaying(1);

            hardResetAudio();

            audio.src = streamUrlRef.current;

            audio.load();

            await audio.play();

            await MediaSession.setPlaybackState({
              playbackState: "playing",
            });

            retryCountRef.current = 0;

            recoveringRef.current = false;

            setPlaying(2);

            startHealthCheck(2500);
          } catch {
            setPlaying(0);

            await MediaSession.setPlaybackState({
              playbackState: "paused",
            });
          }
        },
      );

      await MediaSession.setActionHandler(
        { action: "pause" },
        async () => {
          const audio = audioRef.current;

          if (!audio) return;

          userPausedRef.current = true;

          externalPauseRef.current = false;

          streamFailedRef.current = false;

          manualStopRef.current = true;

          stopHealthCheck();

          setPlaying(0);

          await MediaSession.setPlaybackState({
            playbackState: "paused",
          });

          hardResetAudio();

          manualStopRef.current = false;
        },
      );
    };

    void setupMediaSession();
  }, [selectedSource]);

  const togglePlayback = async () => {

    if (!selectedSource) {
      setManageSourcesOpen(true);
      return;
    }
    const audio = audioRef.current;

    if (!audio) return;

    if (audio.paused) {
      try {
        userPausedRef.current = false;

        externalPauseRef.current = false;

        streamFailedRef.current = false;

        setPlaying(1);

        hardResetAudio();

        audio.src = streamUrlRef.current;

        audio.load();

        await audio.play();

        await MediaSession.setPlaybackState({
          playbackState: "playing",
        });

        retryCountRef.current = 0;

        recoveringRef.current = false;

        setPlaying(2);

        startHealthCheck(2500);
      } catch {
        stopHealthCheck();

        setPlaying(0);

        await MediaSession.setPlaybackState({
          playbackState: "paused",
        });

        hardResetAudio();
      }
    } else {
      userPausedRef.current = true;

      externalPauseRef.current = false;

      streamFailedRef.current = false;

      manualStopRef.current = true;

      stopHealthCheck();

      setPlaying(0);

      await MediaSession.setPlaybackState({
        playbackState: "paused",
      });

      hardResetAudio();

      manualStopRef.current = false;
    }
  };

  const changeSource = async (
    source: StreamSource,
  ) => {
    if (source.url === selectedSource?.url) {
      setSourceMenuOpen(false);
      return;
    }

    const wasPlaying = playing === 2;

    setSelectedSource(source);

    await Preferences.set({
      key: SELECTED_SOURCE_STORAGE_KEY,
      value: source.id,
    });

    setSourceMenuOpen(false);

    if (!wasPlaying) return;

    const audio = audioRef.current;

    if (!audio) return;

    try {
      setPlaying(1);

      hardResetAudio();

      audio.src = source.url;

      audio.load();

      await audio.play();

      await MediaSession.setPlaybackState({
        playbackState: "playing",
      });

      setPlaying(2);

      retryCountRef.current = 0;

      recoveringRef.current = false;

      startHealthCheck(2500);
    } catch (err) {
      console.error("Source switch failed", err);

      setPlaying(0);

      await MediaSession.setPlaybackState({
        playbackState: "paused",
      });

      hardResetAudio();
    }
  };

  const saveSources = async (
    updatedSources: StreamSource[],
  ) => {
    setSources(updatedSources);

    await Preferences.set({
      key: SOURCES_STORAGE_KEY,
      value: JSON.stringify(updatedSources),
    });
  };

  const normalizeStreamUrl = (
    input: string,
  ) => {
    const trimmed = input.trim();

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  };

  const isValidStreamUrl = (url: string) => {
    return /^https?:\/\//i.test(url);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);

    setSourceError("");

    setNewSourceName("");

    setNewSourceUrl("");

    setNewSourceDescription("");
  };

  const attemptCloseAddModal = () => {
    if (hasAddChanges) {
      setDiscardAddOpen(true);
      return;
    }

    closeAddModal();
  };

  const closeEditModal = () => {
    setEditModalOpen(false);

    setEditingSource(null);

    setSourceError("");

    setEditDraft({
      name: "",
      url: "",
      description: "",
    });
  };

  const attemptCloseEditModal = () => {
    if (hasEditChanges) {
      setDiscardEditOpen(true);
      return;
    }

    closeEditModal();
  };

  const addSource = async (): Promise<boolean> => {
    const name = newSourceName.trim();

    const normalizedUrl =
      normalizeStreamUrl(newSourceUrl);

    const fallbackDescription =
      normalizedUrl;

    const description =
      newSourceDescription.trim() ||
      fallbackDescription;

    if (!name) {
      setSourceError(
        "Station name is required",
      );

      return false;
    }

    if (!newSourceUrl.trim()) {
      setSourceError(
        "Stream URL is required",
      );

      return false;
    }

    if (
      !isValidStreamUrl(normalizedUrl)
    ) {
      setSourceError(
        "Invalid stream URL",
      );

      return false;
    }

    const duplicateName = sources.some(
      (source) =>
        source.name.trim().toLowerCase() ===
        name.toLowerCase(),
    );

    if (duplicateName) {
      setSourceError(
        "A station with this name already exists",
      );

      return false;
    }

    setSourceError("");

    const source: StreamSource = {
      id: crypto.randomUUID(),
      name,
      description,
      url: normalizedUrl,
    };

    const updated = [...sources, source];

    await saveSources(updated);

    const wasPlaying =
      playingRef.current === 2;

    setSelectedSource(source);

    await Preferences.set({
      key: SELECTED_SOURCE_STORAGE_KEY,
      value: source.id,
    });

    closeAddModal();

    if (wasPlaying) {
      const audio = audioRef.current;

      if (audio) {
        try {
          setPlaying(1);

          manualStopRef.current = true;

          stopHealthCheck();

          hardResetAudio();

          manualStopRef.current = false;

          const nextUrl = stealthMode
            ? `http://127.0.0.87:8787/proxy?url=${encodeURIComponent(
                source.url,
              )}`
            : source.url;

          audio.src = nextUrl;

          audio.load();

          await audio.play();

          await MediaSession.setPlaybackState({
            playbackState: "playing",
          });

          retryCountRef.current = 0;

          recoveringRef.current = false;

          setPlaying(2);

          startHealthCheck(2500);

        } catch (err) {
          console.error(
            "Failed to mount new stream",
            err,
          );

          setPlaying(0);

          await MediaSession.setPlaybackState({
            playbackState: "paused",
          });
        }
      }
    }

    return true;
  };

  const saveEditedSource = async () => {
    if (!editingSource) return;

    const name = editDraft.name.trim();

    const normalizedUrl =
      normalizeStreamUrl(editDraft.url);

    const description =
      editDraft.description.trim() ||
      normalizedUrl;

    if (!name) {
      setSourceError(
        "Station name is required",
      );

      return;
    }

    if (!editDraft.url.trim()) {
      setSourceError(
        "Stream URL is required",
      );

      return;
    }

    if (
      !isValidStreamUrl(normalizedUrl)
    ) {
      setSourceError(
        "Invalid stream URL",
      );

      return;
    }

    const duplicateName = sources.some(
        (source) =>
          source.id !== editingSource.id &&
          source.name.trim().toLowerCase() ===
            name.toLowerCase(),
      );

      if (duplicateName) {
        setSourceError(
          "A station with this name already exists",
        );

        return;
      }

      setSourceError("");

      const updatedSources = sources.map(
        (source) =>
          source.id === editingSource.id
            ? {
                ...source,
                name,
                url: normalizedUrl,
                description,
              }
            : source,
      );

      await saveSources(updatedSources);

      const updatedSelected =
        updatedSources.find(
          (s) => s.id === editingSource.id,
        ) || null;

      const wasPlaying =
        playingRef.current === 2;

      const urlChanged =
        normalizedUrl !== editingSource.url;

      closeEditModal();

      if (
        selectedSource?.id ===
        editingSource.id
      ) {
        setSelectedSource(updatedSelected);

        if (
          wasPlaying &&
          updatedSelected &&
          urlChanged
        ) {
          const audio = audioRef.current;

          if (audio) {
            try {
              setPlaying(1);

              manualStopRef.current = true;

              stopHealthCheck();

              hardResetAudio();

              manualStopRef.current = false;

              const nextUrl = stealthMode
                ? `http://127.0.0.87:8787/proxy?url=${encodeURIComponent(
                    updatedSelected.url,
                  )}`
                : updatedSelected.url;

              audio.src = nextUrl;

              audio.load();

              await audio.play();

              await MediaSession.setPlaybackState({
                playbackState: "playing",
              });

              retryCountRef.current = 0;

              recoveringRef.current = false;

              setPlaying(2);

              startHealthCheck(2500);

            } catch (err) {
              console.error(
                "Failed to remount edited stream",
                err,
              );

              setPlaying(0);

              await MediaSession.setPlaybackState({
                playbackState: "paused",
              });
            }
          }
        }
      }
  };

  const toggleStealthMode = async () => {
    const next = !stealthMode;

    setStealthMode(next);

    await Preferences.set({
      key: "stealth-mode",
      value: String(next),
    });
  };

  const removeSource = async (id: string) => {
    const updated = sources.filter(
      (s) => s.id !== id,
    );

    await saveSources(updated);

    if (selectedSource?.id === id) {
      if (updated.length > 0) {
        setSelectedSource(updated[0]);

        await Preferences.set({
          key: SELECTED_SOURCE_STORAGE_KEY,
          value: updated[0].id,
        });
      } else {
        setSelectedSource(null);

        await Preferences.remove({
          key: SELECTED_SOURCE_STORAGE_KEY,
        });
      }
    }
  };

  const ChannelArtwork = () => (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      fill="none"
    >
      <rect
        x="8"
        y="8"
        width="84"
        height="84"
        rx="16"
        fill={
          process.env
            .NEXT_PUBLIC_CHANNEL_COLOR
        }
      />

      <g
        stroke="#18181b"
        strokeWidth="5"
        strokeLinecap="round"
      >
        <path d="M24 60V40" />
        <path d="M36 68V32" />
        <path d="M50 76V24" />
        <path d="M64 68V32" />
        <path d="M76 60V40" />
      </g>
    </svg>
  );

  return (
    <div
      className="
        h-[100dvh]
        overflow-hidden
        overscroll-none
        touch-pan-y
        select-none
        text-white
      "
      style={{
        backgroundColor:
          process.env
            .NEXT_PUBLIC_BACKGROUND_COLOR,

        WebkitTapHighlightColor:
          "transparent",

        WebkitTouchCallout: "none",
      }}
    >
      <audio ref={audioRef} preload="none" />

      <div
        className="
          h-full
          overflow-y-auto
          overscroll-y-contain
          scroll-smooth
          [-webkit-overflow-scrolling:touch]
        "
      >
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pt-10 pb-40">
          <div className="mb-8">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              OmniRadio
            </p>
          </div>

          <div className="mx-auto w-full max-w-sm shrink-0">
            <div className="flex aspect-square min-h-0 w-full items-center justify-center overflow-hidden rounded-3xl bg-zinc-800 p-8 shadow-2xl ring-1 ring-white/5">
              <svg
                viewBox="0 0 240 240"
                preserveAspectRatio="xMidYMid meet"
                className="h-full w-full"
                fill="none"
              >
                <rect
                  x="12"
                  y="12"
                  width="216"
                  height="216"
                  rx="28"
                  fill={
                    process.env
                      .NEXT_PUBLIC_CHANNEL_COLOR
                  }
                />

                <g
                  stroke="#18181b"
                  strokeWidth="8"
                  strokeLinecap="round"
                >
                  <path d="M44 140V100" />
                  <path d="M64 160V80" />
                  <path d="M84 176V64" />
                  <path d="M104 150V90" />
                  <path d="M124 188V52" />
                  <path d="M144 150V90" />
                  <path d="M164 176V64" />
                  <path d="M184 160V80" />
                  <path d="M204 140V100" />
                </g>
              </svg>
            </div>
          </div>

          <div className="mt-8 space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {selectedSource?.name || "No source selected"}
            </h1>

            <p className="text-sm text-zinc-400">
              {selectedSource?.description || "Add a radio stream to begin"}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Player */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-zinc-950/90 backdrop-blur-2xl"
        style={{
          backgroundColor:
            process.env
              .NEXT_PUBLIC_PLAYER_COLOR,
        }}
      >
        <div className="mx-auto flex h-[74px] w-full max-w-screen-2xl items-center gap-4 px-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() =>
              setControlsOpen(true)
            }
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-4"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-700 p-2 ring-1 ring-white/5">
              <ChannelArtwork />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium sm:text-base">
                {selectedSource?.name ||
                  "No source selected"}
              </p>

              <p className="truncate text-[13px] text-zinc-400 sm:text-sm">
                {selectedSource?.description ||
                  "Add a radio stream"}
              </p>
            </div>
          </div>

          {/* SOURCE BUTTON */}
          <div
            ref={sidebarSourceRef}
            className="relative shrink-0"
          >
            <button
              type="button"
              onClick={() =>
                setSourceMenuOpen((v) => !v)
              }
              className="flex h-10 min-w-[100px] cursor-pointer items-center justify-between rounded-full bg-white/10 px-3 text-xs font-medium transition hover:bg-white/15"
            >
              Source

              <ChevronUp
                size={14}
                className={`transition-transform ${
                  sourceMenuOpen
                    ? "rotate-180"
                    : ""
                }`}
              />
            </button>

            {/* SOURCE MENU */}
            <div
              className={`absolute bottom-14 right-0 w-72 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl transition-all duration-200 ${
                sourceMenuOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <div className="border-b border-white/5 px-4 py-3">
                <p className="text-sm font-medium">
                  Sources
                </p>

                <p className="mt-1 text-xs text-zinc-400">
                  Choose a stream source
                </p>
              </div>

              <div className="max-h-[320px] overflow-y-auto p-2">
                {sources.map((source) => {
                  const active =
                    source.url === selectedSource?.url;

                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() =>
                        void changeSource(source)
                      }
                      className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {source.name}
                        </p>

                        <p className="truncate text-xs text-zinc-400">
                          {source.description}
                        </p>
                      </div>

                      {active && (
                        <Check
                          size={18}
                          className="text-green-400"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    Stealth Mode
                  </p>

                  <p className="text-[11px] text-zinc-500">
                    Improves compatibility with streams
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void toggleStealthMode()
                  }
                  className={`relative h-5 w-9 rounded-full transition ${
                    stealthMode
                      ? "bg-white"
                      : "bg-white/10"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${
                      stealthMode
                        ? "left-[18px]"
                        : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-white/5 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setManageSourcesOpen(true);

                    setSourceMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10"
                >
                  <Plus size={16} />
                  Manage Sources
                </button>
              </div>
            </div>
          </div>

          {/* PLAY BUTTON */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();

              void togglePlayback();
            }}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed"
            aria-label={
              playing === 2
                ? "Pause"
                : "Play"
            }
            disabled={playing === 1}
          >
            {playing === 1 && (
              <Loader2
                size={20}
                className="animate-spin"
              />
            )}

            {playing === 2 && (
              <Square
                size={18}
                fill="currentColor"
              />
            )}

            {playing === 0 && (
              <Play
                size={18}
                fill="currentColor"
              />
            )}
          </button>
        </div>
      </div>

      {/* Fullscreen Player */}
      <div
        className={`fixed inset-0 z-50 flex flex-col bg-black text-white will-change-transform transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          controlsOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-100"
        }`}
      >
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-12 rounded-full bg-white/20" />
        </div>

        {/* TOP BAR */}
        <div className="absolute left-6 top-6 z-10 flex items-center gap-3">
          <div
            ref={fsSourceRef}
            className="relative"
          >
            <button
              type="button"
              onClick={() =>
                setFsSourceOpen((v) => !v)
              }
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10"
              aria-label="Source settings"
            >
              <Settings size={18} />
            </button>

            <div
              className={`absolute left-0 top-12 w-72 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl transition-all duration-200 ${
                fsSourceOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <div className="border-b border-white/5 px-4 py-3">
                <p className="text-sm font-medium">
                  Sources
                </p>

                <p className="mt-1 text-xs text-zinc-400">
                  Choose a stream source
                </p>
              </div>

              <div className="max-h-[320px] overflow-y-auto p-2">
                {sources.map((source) => {
                  const active =
                    source.url ===
                    selectedSource?.url;

                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => {
                        void changeSource(
                          source,
                        );

                        setFsSourceOpen(false);
                      }}
                      className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {source.name}
                        </p>

                        <p className="truncate text-xs text-zinc-400">
                          {source.description}
                        </p>
                      </div>

                      {active && (
                        <Check
                          size={18}
                          className="text-green-400"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    Stealth Mode
                  </p>

                  <p className="text-[11px] text-zinc-500">
                    Improves compatibility with streams
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void toggleStealthMode()
                  }
                  className={`relative h-5 w-9 rounded-full transition ${
                    stealthMode
                      ? "bg-white"
                      : "bg-white/10"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${
                      stealthMode
                        ? "left-[18px]"
                        : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-white/5 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setManageSourcesOpen(true);

                    setFsSourceOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-3 text-sm transition hover:bg-white/10"
                >
                  <Plus size={16} />
                  Manage Sources
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end px-6 pt-6">
          <button
            type="button"
            onClick={() =>
              setControlsOpen(false)
            }
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/5"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-8 flex h-40 w-40 shrink-0 items-center justify-center rounded-3xl bg-zinc-800 p-6 shadow-2xl">
            <ChannelArtwork />
          </div>

          <h2 className="text-3xl font-semibold">
            {selectedSource?.name ||
              "No source selected"}
          </h2>

          <p className="mt-2 max-w-sm text-sm text-zinc-400">
            {selectedSource?.description ||
              "Add a radio stream to begin listening"}
          </p>

          <button
            type="button"
            onClick={() =>
              void togglePlayback()
            }
            className="mt-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-transform active:scale-95 disabled:opacity-70"
            aria-label={
              playing === 2
                ? "Pause"
                : "Play"
            }
            disabled={playing === 1}
          >
            {playing === 1 && (
              <Loader2
                size={32}
                className="animate-spin"
              />
            )}

            {playing === 2 && (
              <Square
                size={28}
                fill="currentColor"
              />
            )}

            {playing === 0 && (
              <Play
                size={30}
                fill="currentColor"
              />
            )}
          </button>
        </div>
      </div>

      {/* MANAGE SOURCES MODAL */}
      {manageSourcesOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Manage Sources
                </h2>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setAddModalOpen(true)
                    }
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-black"
                  >
                    <Plus size={16} />
                    Add
                  </button>

                  <button
                    onClick={() =>
                      setManageSourcesOpen(false)
                    }
                    className="rounded-full bg-white/5 p-2"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-6 max-h-[320px] space-y-2 overflow-y-auto">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between rounded-xl bg-white/5 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {source.name}
                      </p>

                      <p className="truncate text-xs text-zinc-400">
                        {source.url}
                      </p>
                    </div>

                    {!source.builtIn && (
                    <div className="ml-3 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingSource(source);

                          setEditDraft({
                            name: source.name,
                            url: source.url,
                            description:
                              source.description === source.url
                                ? ""
                                : source.description || "",
                          });

                          setSourceError("");

                          setEditModalOpen(true);
                        }}
                        className="rounded-lg bg-white/10 p-2 text-white"
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        onClick={() =>
                          setDeleteTarget(source)
                        }
                        className="rounded-lg bg-red-500/20 p-2 text-red-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Edit Source
              </h2>

              <button
                onClick={attemptCloseEditModal}
                className="rounded-full bg-white/5 p-2"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <input
                value={editDraft.name}
                onChange={(e) =>
                  setEditDraft((v) => ({
                    ...v,
                    name: e.target.value,
                  }))
                }
                placeholder="Station name"
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              <input
                value={editDraft.url}
                onChange={(e) =>
                  setEditDraft((v) => ({
                    ...v,
                    url: e.target.value,
                  }))
                }
                placeholder="https://stream-url..."
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              <input
                value={editDraft.description}
                onChange={(e) =>
                  setEditDraft((v) => ({
                    ...v,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional description"
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              {sourceError && (
                <p className="text-sm text-red-400">
                  {sourceError}
                </p>
              )}

              <button
                onClick={() =>
                  void saveEditedSource()
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-medium text-black"
              >
                <Check size={18} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Add Source
              </h2>

              <button
                onClick={attemptCloseAddModal}
                className="rounded-full bg-white/5 p-2"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <input
                value={newSourceName}
                onChange={(e) =>
                  setNewSourceName(
                    e.target.value,
                  )
                }
                placeholder="Station name"
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              <input
                value={newSourceUrl}
                onChange={(e) => {
                  setNewSourceUrl(
                    e.target.value,
                  );

                  if (sourceError) {
                    setSourceError("");
                  }
                }}
                placeholder="https://stream-url..."
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              <input
                value={newSourceDescription}
                onChange={(e) =>
                  setNewSourceDescription(
                    e.target.value,
                  )
                }
                placeholder="Optional description"
                className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none"
              />

              {sourceError && (
                <p className="text-sm text-red-400">
                  {sourceError}
                </p>
              )}

              <button
                onClick={() => {
                  void addSource();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-medium text-black"
              >
                <Plus size={18} />
                Add Source
              </button>
            </div>
          </div>
        </div>
      )}

      {discardEditOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold">
              Discard Changes?
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              You have unsaved changes.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() =>
                  setDiscardEditOpen(false)
                }
                className="flex-1 rounded-xl bg-white/5 py-3"
              >
                Continue Editing
              </button>

              <button
                onClick={() => {
                  setDiscardEditOpen(false);

                  closeEditModal();
                }}
                className="flex-1 rounded-xl bg-red-500 py-3 text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {discardAddOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold">
              Discard Changes?
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              You have unsaved changes.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() =>
                  setDiscardAddOpen(false)
                }
                className="flex-1 rounded-xl bg-white/5 py-3"
              >
                Continue Editing
              </button>

              <button
                onClick={() => {
                  setDiscardAddOpen(false);

                  closeAddModal();
                }}
                className="flex-1 rounded-xl bg-red-500 py-3 text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold">
              Delete Source
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              Are you sure you want to delete{" "}
              <span className="font-medium text-white">
                {deleteTarget.name}
              </span>
              ?
            </p>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() =>
                  setDeleteTarget(null)
                }
                className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium transition hover:bg-white/10"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  await removeSource(
                    deleteTarget.id,
                  );

                  setDeleteTarget(null);
                }}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-medium text-white transition hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}