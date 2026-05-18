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

    const wasPlaying = playingRef.current !== 0;

    // fully reset old connection
    manualStopRef.current = true;

    stopHealthCheck();

    hardResetAudio();

    manualStopRef.current = false;

    // if previously playing, reconnect using new URL
    if (wasPlaying) {
      void (async () => {

        const session = beginNewPlaybackSession();

        try {
          const requestId = ++playbackRequestIdRef.current;

          setPlaying(1);

          audio.src = streamUrl;

          audio.load();

          await audio.play();

          if (requestId !== playbackRequestIdRef.current) {
            audio.pause();

            hardResetAudio();

            return;
          }

          if (
            !isPlaybackSessionActive(session)
          ) {
            return;
          }

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

  const playbackRequestIdRef = useRef(0);

  const playbackSessionRef = useRef(0);

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

    audio.currentTime = 0;

    audio.src = "";

    audio.removeAttribute("src");

    audio.load();
  };

  const beginNewPlaybackSession = () => {
    playbackSessionRef.current += 1;

    return playbackSessionRef.current;
  };

  const isPlaybackSessionActive = (
    session: number,
  ) => {
    return (
      playbackSessionRef.current === session
    );
  };

  const reconnectStream = async () => {
    const audio = audioRef.current;

    if (!audio) return;

    const session =
      playbackSessionRef.current;

    if (
      externalPauseRef.current ||
      userPausedRef.current
    ) {
      return;
    }

    try {
      const requestId = ++playbackRequestIdRef.current;

      hardResetAudio();

      audio.src = streamUrlRef.current;

      audio.load();

      await audio.play();

      if (requestId !== playbackRequestIdRef.current) {
        audio.pause();

        hardResetAudio();

        return;
      }

      if (
        !isPlaybackSessionActive(session)
      ) {
        return;
      }

      await MediaSession.setPlaybackState({
        playbackState: "playing",
      });

      recoveringRef.current = false;

      retryCountRef.current = 0;

      setPlaying(2);

      startHealthCheck(2500);

    } catch (err) {

      if (
        !isPlaybackSessionActive(session)
      ) {
        return;
      }

      console.error(
        "Reconnect failed",
        err,
      );
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
        keepalive: true,
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

            const session = beginNewPlaybackSession();

            const requestId = ++playbackRequestIdRef.current;

            setPlaying(1);

            hardResetAudio();

            audio.src = streamUrlRef.current;

            audio.load();

            await audio.play();

            if (requestId !== playbackRequestIdRef.current) {
              audio.pause();

              hardResetAudio();

              return;
            }

            if (
              !isPlaybackSessionActive(session)
            ) {
              return;
            }

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
        const session = beginNewPlaybackSession();

        userPausedRef.current = false;

        externalPauseRef.current = false;

        streamFailedRef.current = false;

        const requestId = ++playbackRequestIdRef.current;

        setPlaying(1);

        hardResetAudio();

        audio.src = streamUrlRef.current;

        audio.load();

        await audio.play();

        if (requestId !== playbackRequestIdRef.current) {
          audio.pause();

          hardResetAudio();

          return;
        }

        if (
          !isPlaybackSessionActive(session)
        ) {
          return;
        }

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

    const audio = audioRef.current;

    // TRUE only if stream was actively playing
    const wasPlaying =
      !!audio &&
      !audio.paused &&
      !audio.ended &&
      playingRef.current != 0;

    // invalidate old async tasks
    const session =
      beginNewPlaybackSession();

    stopHealthCheck();

    recoveringRef.current = false;
    retryCountRef.current = 0;
    externalPauseRef.current = false;
    streamFailedRef.current = false;

    // Preserve user pause intent
    userPausedRef.current = !wasPlaying;

    manualStopRef.current = true;

    // destroy old stream
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.src = "";
      audio.load();
    }

    manualStopRef.current = false;

    setSelectedSource(source);

    await Preferences.set({
      key: SELECTED_SOURCE_STORAGE_KEY,
      value: source.id,
    });

    setSourceMenuOpen(false);

    if (!wasPlaying || !audio) {
      setPlaying(0);

      await MediaSession.setPlaybackState({
        playbackState: "paused",
      });

      return;
    }

    try {
      const requestId = ++playbackRequestIdRef.current;

      setPlaying(1);

      manualStopRef.current = true;

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

      if (requestId !== playbackRequestIdRef.current) {
        audio.pause();

        hardResetAudio();

        return;
      }

      // ignore stale playback
      if (
        !isPlaybackSessionActive(session)
      ) {
        return;
      }

      retryCountRef.current = 0;

      recoveringRef.current = false;

      setPlaying(2);

      await MediaSession.setPlaybackState({
        playbackState: "playing",
      });

      startHealthCheck(2500);

    } catch (err) {

      // ignore stale failures
      if (
        !isPlaybackSessionActive(session)
      ) {
        return;
      }

      console.error(
        "Source switch failed",
        err,
      );

      stopHealthCheck();

      hardResetAudio();

      setPlaying(0);

      await MediaSession.setPlaybackState({
        playbackState: "paused",
      });
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

  const canonicalizeStreamUrl = (
    input: string,
  ) => {
    const normalized =
      normalizeStreamUrl(input).trim();

    try {
      const url = new URL(normalized);

      // normalize hostname casing
      url.hostname = url.hostname.toLowerCase();

      // remove trailing slash
      url.pathname = url.pathname.replace(
        /\/+$/,
        "",
      );

      return url.toString();
    } catch {
      return normalized.toLowerCase();
    }
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

    const canonicalUrl =
      canonicalizeStreamUrl(normalizedUrl);

    const duplicateUrl = sources.some(
      (source) =>
        canonicalizeStreamUrl(source.url) ===
        canonicalUrl,
    );

    if (duplicateUrl) {
      setSourceError(
        "A station with this stream URL already exists",
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

    const wasPlaying = playingRef.current !== 0;

    setSelectedSource(source);

    await Preferences.set({
      key: SELECTED_SOURCE_STORAGE_KEY,
      value: source.id,
    });

    closeAddModal();

    if (wasPlaying) {
      const audio = audioRef.current;

      if (audio) {

        const session = beginNewPlaybackSession();

        try {
          const requestId = ++playbackRequestIdRef.current;

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

          if (requestId !== playbackRequestIdRef.current) {
            audio.pause();

            hardResetAudio();

            return false;
          }

          if (
            !isPlaybackSessionActive(session)
          ) {
            return false;
          }

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

      const canonicalUrl =
        canonicalizeStreamUrl(normalizedUrl);

      const duplicateUrl = sources.some(
        (source) =>
          source.id !== editingSource.id &&
          canonicalizeStreamUrl(source.url) ===
            canonicalUrl,
      );

      if (duplicateUrl) {
        setSourceError(
          "A station with this stream URL already exists",
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

      const wasPlaying = playingRef.current !== 0;

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

            const session = beginNewPlaybackSession();

            try {
              const requestId = ++playbackRequestIdRef.current;

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

              if (requestId !== playbackRequestIdRef.current) {
                audio.pause();

                hardResetAudio();

                return;
              }

              if (
                !isPlaybackSessionActive(session)
              ) {
                return;
              }

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

    const wasPlaying = playingRef.current !== 0;

    await saveSources(updated);

    if (selectedSource?.id === id) {
      if (updated.length > 0) {
        await Preferences.set({
          key: SELECTED_SOURCE_STORAGE_KEY,
          value: updated[0].id,
        });

        if (wasPlaying) {
          await changeSource(updated[0]);
        } else {
          setSelectedSource(updated[0]);
        }

      } else {
        setSelectedSource(null);

        await Preferences.remove({
          key: SELECTED_SOURCE_STORAGE_KEY,
        });
      }
    }
  };

  const modalTransition =
    "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

  const backdropTransition =
    "transition-opacity duration-300 ease-out";

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
      <div
        className={`
          fixed inset-0 z-[100]
          ${manageSourcesOpen ? "pointer-events-auto" : "pointer-events-none"}
        `}
      >
        {/* BACKDROP */}
        <div
          onClick={() =>
            setManageSourcesOpen(false)
          }
          className={`
            absolute inset-0
            bg-black/50 backdrop-blur-xl
            ${backdropTransition}

            ${
              manageSourcesOpen
                ? "opacity-100"
                : "opacity-0"
            }
          `}
        />

        {/* SHEET */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            max-h-[85vh]
            rounded-t-[32px]
            border-t border-white/10
            bg-zinc-900/95
            px-5 pb-6 pt-3
            shadow-[0_20px_80px_rgba(0,0,0,0.65)]
            backdrop-blur-2xl

            sm:left-1/2
            sm:max-w-md
            sm:-translate-x-1/2
            sm:bottom-6
            sm:rounded-[32px]
            sm:border

            ${modalTransition}

            ${
              manageSourcesOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            }
          `}
        >
          {/* HANDLE */}
          <div className="mb-4 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
          </div>

          {/* HEADER */}
          <div
            className={`
              flex items-center justify-between
              transition-all duration-500 delay-75

              ${
                manageSourcesOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }
            `}
          >
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Manage Sources
              </h2>

              <p className="mt-1 text-sm text-zinc-400">
                Add, edit, and organize streams
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setAddModalOpen(true)
                }
                className="
                  flex items-center gap-2
                  rounded-2xl
                  bg-white
                  px-4 py-2.5
                  text-sm font-medium
                  text-black
                  transition-all duration-150
                  active:scale-95
                "
              >
                <Plus size={16} />
                Add
              </button>

              <button
                onClick={() =>
                  setManageSourcesOpen(false)
                }
                className="
                  rounded-full
                  bg-white/5
                  p-2
                  transition-all duration-150
                  hover:bg-white/10
                  active:scale-95
                "
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* LIST */}
          <div
            className={`
              mt-6
              max-h-[55vh]
              space-y-2
              overflow-y-auto
              overscroll-contain
              [-webkit-overflow-scrolling:touch]

              transition-all duration-500 delay-100

              ${
                manageSourcesOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }
            `}
          >
            {sources.map((source, index) => (
              <div
                key={source.id}
                className="
                  flex items-center justify-between
                  rounded-2xl
                  border border-white/[0.05]
                  bg-white/[0.03]
                  p-3

                  transition-all duration-200
                  hover:bg-white/[0.05]
                  active:scale-[0.985]
                "
                style={{
                  transitionDelay: `${index * 35}ms`,
                }}
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
                      className="
                        rounded-xl
                        bg-white/10
                        p-2
                        transition-all duration-150
                        hover:bg-white/15
                        active:scale-95
                      "
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      onClick={() =>
                        setDeleteTarget(source)
                      }
                      className="
                        rounded-xl
                        border border-red-500/20
                        bg-red-500/10
                        p-2
                        text-red-300

                        transition-all duration-150
                        hover:bg-red-500/20
                        active:scale-95
                      "
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

      {/* Edit Source modal */}
      <div
        className={`
          fixed inset-0 z-[120]
          ${editModalOpen ? "pointer-events-auto" : "pointer-events-none"}
        `}
      >
        {/* BACKDROP */}
        <div
          onClick={attemptCloseEditModal}
          className={`
            absolute inset-0
            bg-black/50 backdrop-blur-xl
            ${backdropTransition}

            ${
              editModalOpen
                ? "opacity-100"
                : "opacity-0"
            }
          `}
        />

        {/* SHEET */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            rounded-t-[32px]
            border-t border-white/10
            bg-zinc-900/95
            px-5 pb-8 pt-3
            shadow-[0_20px_80px_rgba(0,0,0,0.6)]
            backdrop-blur-2xl

            sm:left-1/2
            sm:max-w-md
            sm:-translate-x-1/2
            sm:bottom-6
            sm:rounded-[32px]
            sm:border

            ${modalTransition}

            ${
              editModalOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            }
          `}
        >
          {/* HANDLE */}
          <div className="mb-5 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
          </div>

          {/* HEADER */}
          <div
            className={`
              flex items-center justify-between
              transition-all duration-500 delay-75

              ${
                editModalOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }
            `}
          >
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Edit Source
              </h2>

              <p className="mt-1 text-sm text-zinc-400">
                Update stream details
              </p>
            </div>

            <button
              onClick={attemptCloseEditModal}
              className="
                rounded-full
                bg-white/5
                p-2
                transition-all duration-150
                hover:bg-white/10
                active:scale-95
              "
            >
              <X size={18} />
            </button>
          </div>

          {/* FORM */}
          <div
            className={`
              mt-6 space-y-3
              transition-all duration-500 delay-100

              ${
                editModalOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }
            `}
          >
            <input
              value={editDraft.name}
              onChange={(e) =>
                setEditDraft((v) => ({
                  ...v,
                  name: e.target.value,
                }))
              }
              placeholder="Station name"
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
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
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
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
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
            />

            {sourceError && (
              <p className="px-1 text-sm text-red-400">
                {sourceError}
              </p>
            )}

            <button
              onClick={() =>
                void saveEditedSource()
              }
              className="
                flex w-full items-center justify-center gap-2
                rounded-2xl
                bg-white
                py-3.5
                font-medium
                text-black
                transition-all duration-150
                active:scale-[0.98]
              "
            >
              <Check size={18} />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Add Source modal */}
      <div
        className={`
          fixed inset-0 z-[120]
          ${addModalOpen ? "pointer-events-auto" : "pointer-events-none"}
        `}
      >
        {/* BACKDROP */}
        <div
          onClick={attemptCloseAddModal}
          className={`
            absolute inset-0
            bg-black/50 backdrop-blur-xl
            ${backdropTransition}
            ${
              addModalOpen
                ? "opacity-100"
                : "opacity-0"
            }
          `}
        />

        {/* SHEET */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            rounded-t-[32px]
            border-t border-white/10
            bg-zinc-900/95
            px-5 pb-8 pt-3
            shadow-[0_20px_80px_rgba(0,0,0,0.6)]
            backdrop-blur-2xl

            sm:left-1/2 sm:max-w-md sm:-translate-x-1/2
            sm:bottom-6 sm:rounded-[32px]
            sm:border sm:border-white/10

            ${modalTransition}

            ${
              addModalOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            }
          `}
        >
          {/* HANDLE */}
          <div className="mb-5 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
          </div>

          {/* HEADER */}
          <div
            className={`
              flex items-center justify-between
              transition-all duration-500 delay-75
              ${
                addModalOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }
            `}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Add Source
            </h2>

            <button
              onClick={attemptCloseAddModal}
              className="
                rounded-full
                bg-white/5
                p-2
                transition-all duration-150
                hover:bg-white/10
                active:scale-95
              "
            >
              <X size={18} />
            </button>
          </div>

          {/* FORM */}
          <div
            className={`
              mt-6 space-y-3
              transition-all duration-500 delay-100
              ${
                addModalOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }
            `}
          >
            <input
              value={newSourceName}
              onChange={(e) =>
                setNewSourceName(
                  e.target.value,
                )
              }
              placeholder="Station name"
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
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
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
            />

            <input
              value={newSourceDescription}
              onChange={(e) =>
                setNewSourceDescription(
                  e.target.value,
                )
              }
              placeholder="Optional description"
              className="
                w-full rounded-2xl
                border border-white/[0.06]
                bg-white/[0.04]
                px-4 py-3
                text-white
                outline-none
                transition-all duration-200
                focus:border-white/20
                focus:bg-white/[0.06]
              "
            />

            {sourceError && (
              <p className="px-1 text-sm text-red-400">
                {sourceError}
              </p>
            )}

            <button
              onClick={() => {
                void addSource();
              }}
              className="
                flex w-full items-center justify-center gap-2
                rounded-2xl
                bg-white
                py-3.5
                font-medium
                text-black
                transition-all duration-150
                active:scale-[0.98]
              "
            >
              <Plus size={18} />
              Add Source
            </button>
          </div>
        </div>
      </div>

      {/* Discard Modal */}
      <div
        className={`
          fixed inset-0 z-[130]
          ${
            discardEditOpen || discardAddOpen
              ? "pointer-events-auto"
              : "pointer-events-none"
          }
        `}
      >
        {/* BACKDROP */}
        <div
          onClick={() => {
            setDiscardEditOpen(false);
            setDiscardAddOpen(false);
          }}
          className={`
            absolute inset-0
            bg-black/50 backdrop-blur-xl
            ${backdropTransition}

            ${
              discardEditOpen || discardAddOpen
                ? "opacity-100"
                : "opacity-0"
            }
          `}
        />

        {/* ALERT */}
        <div
          className={`
            absolute inset-x-4 bottom-4
            rounded-[28px]
            border border-white/10
            bg-zinc-900/95
            p-5
            shadow-[0_20px_80px_rgba(0,0,0,0.6)]
            backdrop-blur-2xl

            sm:left-1/2
            sm:max-w-sm
            sm:-translate-x-1/2

            ${modalTransition}

            ${
              discardEditOpen || discardAddOpen
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-10 opacity-0 scale-[0.96]"
            }
          `}
        >
          <div
            className={`
              transition-all duration-500 delay-75

              ${
                discardEditOpen || discardAddOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }
            `}
          >
            <h3 className="text-xl font-semibold tracking-tight">
              Discard Changes?
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Your unsaved edits will be lost.
            </p>
          </div>

          <div
            className={`
              mt-6 flex gap-3
              transition-all duration-500 delay-100

              ${
                discardEditOpen || discardAddOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }
            `}
          >
            <button
              onClick={() => {
                setDiscardEditOpen(false);
                setDiscardAddOpen(false);
              }}
              className="
                flex-1 rounded-2xl
                bg-white/[0.06]
                py-3 text-sm font-medium

                transition-all duration-150
                hover:bg-white/[0.1]
                active:scale-[0.98]
              "
            >
              Continue Editing
            </button>

            <button
              onClick={() => {
                if (discardEditOpen) {
                  closeEditModal();
                }

                if (discardAddOpen) {
                  closeAddModal();
                }

                setDiscardEditOpen(false);
                setDiscardAddOpen(false);
              }}
              className="
                flex-1 rounded-2xl
                bg-red-500
                py-3 text-sm font-medium text-white

                transition-all duration-150
                hover:bg-red-400
                active:scale-[0.98]
              "
            >
              Discard
            </button>
          </div>
        </div>
      </div>

      {/* Delete Target Modal */}
      <div
        className={`
          fixed inset-0 z-[110]
          ${deleteTarget ? "pointer-events-auto" : "pointer-events-none"}
        `}
      >
        {/* BACKDROP */}
        <div
          onClick={() =>
            setDeleteTarget(null)
          }
          className={`
            absolute inset-0
            bg-black/50 backdrop-blur-xl
            ${backdropTransition}

            ${
              deleteTarget
                ? "opacity-100"
                : "opacity-0"
            }
          `}
        />

        {/* ALERT SHEET */}
        <div
          className={`
            absolute inset-x-4 bottom-4
            rounded-[28px]
            border border-white/10
            bg-zinc-900/95
            p-5
            shadow-[0_20px_80px_rgba(0,0,0,0.6)]
            backdrop-blur-2xl

            sm:left-1/2
            sm:max-w-sm
            sm:-translate-x-1/2

            ${modalTransition}

            ${
              deleteTarget
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-10 opacity-0 scale-[0.96]"
            }
          `}
        >
          <div
            className={`
              transition-all duration-500 delay-75

              ${
                deleteTarget
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }
            `}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
              <Trash2
                size={24}
                className="text-red-300"
              />
            </div>

            <h3 className="text-xl font-semibold tracking-tight">
              Delete Source
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Remove{" "}
              <span className="font-medium text-white">
                {deleteTarget?.name}
              </span>{" "}
              from your sources?
            </p>
          </div>

          <div
            className={`
              mt-6 flex gap-3
              transition-all duration-500 delay-100

              ${
                deleteTarget
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
              }
            `}
          >
            <button
              onClick={() =>
                setDeleteTarget(null)
              }
              className="
                flex-1 rounded-2xl
                bg-white/[0.06]
                py-3 text-sm font-medium

                transition-all duration-150
                hover:bg-white/[0.1]
                active:scale-[0.98]
              "
            >
              Cancel
            </button>

            <button
              onClick={async () => {
                if (!deleteTarget) return;

                await removeSource(
                  deleteTarget.id,
                );

                setDeleteTarget(null);
              }}
              className="
                flex-1 rounded-2xl
                bg-red-500
                py-3 text-sm font-medium text-white

                transition-all duration-150
                hover:bg-red-400
                active:scale-[0.98]
              "
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}