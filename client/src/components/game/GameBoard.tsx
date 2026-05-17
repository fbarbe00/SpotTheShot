import { useState, useMemo, useEffect, useRef, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent, type TouchEvent as ReactTouchEvent } from "react";
import type { Lobby, Photo } from "../../lib/types";
import { buildPhotoUrl, socket } from "../../lib/socket";
import { HUD } from "../HUD";
import MapGuess from "../MapGuess";
import { Maximize, Minimize } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../../lib/toast";
import { useI18n } from "../../contexts/I18nContext";
import { logger } from "../../lib/logger";

const AI_TIP_COUNT = 50;

/**
 * GameBoard Module
 * Photo display + map guess interface for active game rounds
 */

type GameBoardProps = {
  lobby: Lobby;
  photo: Photo | null;
  roundInfo: { roundIndex: number; totalRounds: number; duration: number };
  timerMs: number;
  timerStarted?: boolean;
  playerId: string;
  onSubmitGuess: (p: { lat: number; lon: number }) => void;
};

export function GameBoard({
  lobby,
  photo,
  roundInfo,
  timerMs,
  timerStarted = true,
  playerId,
  onSubmitGuess,
}: GameBoardProps) {
  const MAP_TOOLTIP_KEY = "geo-snap-map-tooltip-seen";
  const isUploader = photo?.uploaderId === playerId;
  const uploaderPenalty = lobby.settings.uploaderPenaltyPercent ?? 10;
  const canGuessThisRound = !(isUploader && uploaderPenalty >= 100);

  // Re-initialize state from existing guess in the lobby if we reconnected
  const existingGuess = useMemo(() => {
    return lobby.currentGuesses?.[playerId];
  }, [lobby.currentGuesses, playerId]);

  const [isMapExpanded, setMapExpanded] = useState(false);
  const [currentPin, setCurrentPin] = useState<{ lat: number; lon: number } | null>(existingGuess || null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [isLocked, setIsLocked] = useState(!!existingGuess);
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [showMapHint, setShowMapHint] = useState(() => {
    try {
      return window.localStorage.getItem(MAP_TOOLTIP_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const touchPanStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasSubmittedRef = useRef(!!existingGuess);
  const lastPhotoIdRef = useRef(photo?.id);
  const { addToast } = useToast();
  const { t } = useI18n();

  const [aiTipIndex, setAiTipIndex] = useState<number | null>(null);

  const uploaderName = useMemo(
    () => lobby.players.find(p => p.id === photo?.uploaderId)?.nickname ?? "Unknown",
    [lobby, photo]
  );
  const photoDetails = useMemo(
    () => {
      const result = { title: photo?.title ?? "", hint: photo?.hint ?? "", captureDate: photo?.captureDate };
      return result;
    },
    [photo]
  );

  const handleConfirmGuess = (p: { lat: number; lon: number }) => {
    if (!canGuessThisRound) return;
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsLocked(true);
    setCurrentPin(p);
    onSubmitGuess(p);
    setMapExpanded(false);
  };

  const handlePinChange = (p: { lat: number; lon: number } | null) => {
    if (!isLocked) setCurrentPin(p);
    if (p && showMapHint) {
      setShowMapHint(false);
      try { window.localStorage.setItem(MAP_TOOLTIP_KEY, "1"); } catch { /* no-op */ }
    }
  };

  useEffect(() => {
    if (!canGuessThisRound) return;
    if (timerStarted && timerMs < 1000 && !hasSubmittedRef.current && currentPin) {
      hasSubmittedRef.current = true;
      setIsLocked(true);
      onSubmitGuess(currentPin);
    }
  }, [timerMs, timerStarted, currentPin, onSubmitGuess, canGuessThisRound]);

  // Reset state when photo changes - this is intentional and necessary
  useEffect(() => {
    if (photo?.id !== lastPhotoIdRef.current) {
      hasSubmittedRef.current = false;
      setIsLocked(false);
      setCurrentPin(null);
      setImageScale(1);
      setImageOffset({ x: 0, y: 0 });
      setIsDraggingImage(false);
      dragStartRef.current = null;
      pinchStartDistanceRef.current = null;
      pinchStartScaleRef.current = 1;
      touchPanStartRef.current = null;
      lastPhotoIdRef.current = photo?.id;
    }
  }, [photo?.id]);

  // Show a random AI tip bubble when AI guessing is enabled (60% chance per round)
  useEffect(() => {
    if (!lobby.settings.enableAIGuessing || !photo?.id) {
      setAiTipIndex(null);
      return;
    }
    if (Math.random() >= 0.6) return;
    const idx = Math.floor(Math.random() * AI_TIP_COUNT);
    const showTimer = setTimeout(() => setAiTipIndex(idx), 600);
    const hideTimer = setTimeout(() => setAiTipIndex(null), 9000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id, lobby.settings.enableAIGuessing]);

  const clampImageScale = (value: number) => Math.max(1, Math.min(4, value));

  const handleImageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    // Trackpads emit wheel deltas for two-finger panning.
    // When zoomed in, treat wheel as pan unless pinch-zoom modifiers are active.
    if (imageScale > 1 && !event.ctrlKey && !event.metaKey) {
      setImageOffset(prev => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
      return;
    }

    const zoomDelta = event.deltaY > 0 ? -0.15 : 0.15;
    setImageScale(prev => {
      const next = clampImageScale(prev + zoomDelta);
      if (next === 1) setImageOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleImageMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (imageScale <= 1) return;
    setIsDraggingImage(true);
    dragStartRef.current = {
      x: event.clientX - imageOffset.x,
      y: event.clientY - imageOffset.y,
    };
  };

  const handleImageMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDraggingImage || !dragStartRef.current) return;
    setImageOffset({
      x: event.clientX - dragStartRef.current.x,
      y: event.clientY - dragStartRef.current.y,
    });
  };

  const stopImageDrag = () => {
    setIsDraggingImage(false);
    dragStartRef.current = null;
  };

  const touchDistance = (
    touchA: { clientX: number; clientY: number },
    touchB: { clientX: number; clientY: number }
  ) => {
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleImageTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      if (!a || !b) return;
      pinchStartDistanceRef.current = touchDistance(a, b);
      pinchStartScaleRef.current = imageScale;
      touchPanStartRef.current = null;
      return;
    }

    if (event.touches.length === 1 && imageScale > 1) {
      const touch = event.touches[0];
      if (!touch) return;
      touchPanStartRef.current = {
        x: touch.clientX - imageOffset.x,
        y: touch.clientY - imageOffset.y,
      };
    }
  };

  const handleImageTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      if (!a || !b || !pinchStartDistanceRef.current) return;
      event.preventDefault();
      const currentDistance = touchDistance(a, b);
      const scaleFactor = currentDistance / pinchStartDistanceRef.current;
      const nextScale = clampImageScale(pinchStartScaleRef.current * scaleFactor);
      setImageScale(nextScale);
      if (nextScale === 1) {
        setImageOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (event.touches.length === 1 && imageScale > 1 && touchPanStartRef.current) {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      setImageOffset({
        x: touch.clientX - touchPanStartRef.current.x,
        y: touch.clientY - touchPanStartRef.current.y,
      });
    }
  };

  const handleImageTouchEnd = () => {
    if (pinchStartDistanceRef.current !== null) {
      pinchStartDistanceRef.current = null;
      pinchStartScaleRef.current = imageScale;
    }
    if (imageScale <= 1) {
      touchPanStartRef.current = null;
    }
  };

  // Listen for other players' guesses and show toast notifications
  useEffect(() => {
    const handlePlayerGuess = (data: { playerId: string; nickname: string }) => {
      if (data.playerId !== playerId) {
        addToast(t('result.playerGuessed', { player: data.nickname }), "info", 3000);
      }
    };

    socket.on('player_guess', handlePlayerGuess);

    return () => {
      socket.off('player_guess', handlePlayerGuess);
    };
  }, [addToast, playerId, t]);

  useEffect(() => {
    if (!showMapHint || !canGuessThisRound) return;
    const timer = setTimeout(() => {
      setShowMapHint(false);
      try { window.localStorage.setItem(MAP_TOOLTIP_KEY, "1"); } catch { /* no-op */ }
    }, 7000);
    return () => clearTimeout(timer);
  }, [showMapHint, canGuessThisRound]);

  if (!photo?.url || typeof photo.url !== "string") {
    return (
      <div className="relative w-full min-h-[60vh] max-h-[80vh] bg-black rounded-xl overflow-hidden border-2 border-primary/20 flex items-center justify-center">
        <div className="text-center text-red-400">
          <p className="text-lg font-bold mb-2">{t('error.photoLoad')}</p>
          <p className="text-sm">{t('error.photoLoadHelp')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[60vh] max-h-[80vh] bg-black rounded-xl overflow-hidden border-2 border-primary/20">
      <div className="absolute top-0 left-0 right-0 p-1 md:p-2 bg-gradient-to-b from-black/60 to-transparent z-[1001]">
        <HUD
          timeMs={timerStarted ? timerMs : 0}
          timerStarted={timerStarted}
          round={roundInfo.roundIndex}
          total={roundInfo.totalRounds}
          uploaderName={uploaderName}
          title={photoDetails.title}
          hint={photoDetails.hint}
          hintThresholdSec={lobby.settings.hintThresholdSec || 10}
          captureDate={photo?.captureDate}
          showImageDate={lobby.settings.showImageDate || false}
        />
      </div>

      <div
        className={`absolute inset-0 overflow-hidden ${imageScale > 1 ? 'cursor-grab' : ''} ${isDraggingImage ? 'cursor-grabbing' : ''}`}
        onWheel={handleImageWheel}
        onMouseDown={handleImageMouseDown}
        onMouseMove={handleImageMouseMove}
        onMouseUp={stopImageDrag}
        onMouseLeave={stopImageDrag}
        onTouchStart={handleImageTouchStart}
        onTouchMove={handleImageTouchMove}
        onTouchEnd={handleImageTouchEnd}
        onTouchCancel={handleImageTouchEnd}
        style={{ touchAction: imageScale > 1 ? 'none' : 'pan-y' }}
      >
        <img
          src={buildPhotoUrl(photo.url, lobby.id, playerId)}
          className="absolute inset-0 w-full h-full object-contain select-none"
          style={{
            transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageScale})`,
            transformOrigin: 'center center',
          }}
          draggable={false}
          alt={t('ui.guessLocation')}
          onError={() => logger.error('GameBoard failed to load photo', photo.url)}
        />
      </div>

      {!isMapExpanded && (
        <div className="absolute bottom-2 left-2 z-[1002] flex flex-col gap-1">
          <button
            onClick={() => setImageScale(prev => clampImageScale(prev + 0.2))}
            className="w-6 h-6 rounded-full bg-surface/85 text-white border border-primary/30 hover:bg-surface text-xs leading-none"
            title={t('ui.zoomIn')}
          >
            +
          </button>
          <button
            onClick={() => {
              setImageScale(prev => {
                const next = clampImageScale(prev - 0.2);
                if (next === 1) setImageOffset({ x: 0, y: 0 });
                return next;
              });
            }}
            className="w-6 h-6 rounded-full bg-surface/85 text-white border border-primary/30 hover:bg-surface text-xs leading-none"
            title={t('ui.zoomOut')}
          >
            -
          </button>
          <button
            onClick={() => {
              setImageScale(1);
              setImageOffset({ x: 0, y: 0 });
            }}
            className="px-2 h-6 rounded-full bg-surface/85 text-white border border-primary/30 hover:bg-surface text-[10px] font-semibold"
            title={t('ui.resetZoom')}
          >
            Reset
          </button>
        </div>
      )}

      {!isMapExpanded && canGuessThisRound && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
          onClick={() => setMapExpanded(true)}
          className="absolute bottom-2 right-2 z-10 w-48 h-32 cursor-pointer group"
        >
          <div className="absolute inset-0">
            <MapGuess
              onConfirm={() => {}}
              isExpanded={false}
              isLocked={true}
              guess={currentPin}
              miniMap={true}
              savedCenter={mapCenter}
              onMapStateChange={setMapCenter}
              onPinChange={() => {}}
              mapStyle={lobby.settings.mapStyle || 'osm'}
              mapLanguage={lobby.settings.mapLanguage || 'local'}
            />
          </div>
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="p-2 rounded-full bg-surface/80 text-white backdrop-blur-sm">
              <Maximize size={20} />
            </div>
          </div>
          {showMapHint && (
            <div className="absolute -top-10 right-0 px-2 py-1 rounded-lg bg-surface/95 border border-primary/30 text-xs text-text shadow-lg whitespace-nowrap">
              {t("game.mapHintMini")}
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {isMapExpanded && canGuessThisRound && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="relative w-[95%] h-[95%] rounded-xl overflow-hidden">
              <MapGuess
                onConfirm={handleConfirmGuess}
                isExpanded={isMapExpanded}
                isLocked={isLocked}
                guess={currentPin}
                savedCenter={mapCenter}
                onMapStateChange={setMapCenter}
                onPinChange={handlePinChange}
                mapStyle={lobby.settings.mapStyle || 'osm'}
                mapLanguage={lobby.settings.mapLanguage || 'local'}
              />
              <button onClick={() => setMapExpanded(false)}
                className="absolute bottom-4 left-4 z-[1000] p-3 rounded-full bg-surface hover:bg-primary/80 text-white transition-colors">
                <Minimize size={24} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI tip bubble — right side, middle height, non-blocking */}
      <AnimatePresence>
        {aiTipIndex !== null && !isMapExpanded && !isLocked && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[1002] flex items-center gap-1.5 pointer-events-auto"
          >
            {/* Speech bubble */}
            <div className="relative bg-surface/90 border border-primary/20 rounded-xl px-2.5 py-2 text-[11px] text-text-darker max-w-[120px] text-right backdrop-blur-sm shadow-lg">
              {t(`game.aiTip.${aiTipIndex}`)}
              {/* Tail pointing right */}
              <span className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-l-[6px] border-l-surface/90" />
            </div>
            {/* Robot circle */}
            <button
              onClick={() => setAiTipIndex(null)}
              className="w-8 h-8 rounded-full bg-surface/90 border border-primary/20 flex items-center justify-center text-base flex-shrink-0 backdrop-blur-sm shadow-lg hover:bg-surface transition-colors"
              aria-label="Dismiss AI tip"
            >
              🤖
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLocked && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-40 backdrop-blur-sm">
          <h2 className="text-3xl font-bold text-primary">{t("game.guessLocked")}</h2>
          <p className="text-text-darker mt-2">{t("game.waitingOthers")}</p>
        </div>
      )}

      {!canGuessThisRound && (
        <div className="absolute inset-0 z-40 bg-black/40 flex flex-col items-center justify-center text-center px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-primary">{t("game.waitingOthers")}</h2>
          <p className="text-text-darker mt-2 max-w-lg">
            {t("game.uploaderSkip")}
          </p>
        </div>
      )}
    </div>
  );
}
